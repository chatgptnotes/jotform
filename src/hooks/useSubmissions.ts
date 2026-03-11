import { useState, useEffect, useCallback, useMemo } from 'react';
import { Submission, ApprovalEntry, ApprovalLevel, FilterConfig, SortConfig, PaginationConfig, RefreshConfig, WorkflowActionType } from '../types';
import { getDashboardStats, getApprovalLevelStats, getDepartmentStats, getTrendData, getBottleneckData, getHeatmapData } from '../services/mockData';
import { supabase } from '../lib/supabase';
import { fetchUserForms, fetchFormQuestions, detectFields, JFFormMeta, DetectedFields } from '../services/formDiscovery';

// ─── Workflow step type cache (per formId) ────────────────────────────────────
interface WorkflowStep { level: number; type: WorkflowActionType; }
const workflowCache: Record<string, WorkflowStep[]> = {};

async function fetchWorkflowSteps(formId: string): Promise<WorkflowStep[]> {
  if (workflowCache[formId]) return workflowCache[formId];
  try {
    const res = await fetch(`/api/form-workflow?formId=${formId}`);
    if (!res.ok) return [];
    const data = await res.json();
    const steps: WorkflowStep[] = (data.steps || []).map((s: WorkflowStep) => ({
      level: s.level,
      type: s.type,
    }));
    workflowCache[formId] = steps;
    return steps;
  } catch {
    return [];
  }
}

function getActionType(steps: WorkflowStep[], currentLevel: number | string): WorkflowActionType {
  if (typeof currentLevel !== 'number') return 'approval';
  const step = steps.find(s => s.level === currentLevel);
  return step?.type ?? 'approval';
}

// ─── Forms we track ───────────────────────────────────────────────────────────
const FORM_ID = '260562405560351';
const FORM_TITLE = 'Purchase Order Approval';

const CONTENT_FORM_ID = '260562114142344';
const CONTENT_FORM_TITLE = 'Content Publishing Approval Request';

const TASK_TEST_FORM_ID = '260673958643066';
const TASK_TEST_FORM_TITLE = 'Task Workflow (Test)';

// ─── Field ID map for form 260562405560351 (Purchase Order) ───────────────────
const FIELD = {
  requesterName: '2', email: '3', department: '4',
  description: '5', amount: '6', priority: '7',
  l1Status: '8', l1Approver: '9', l1Date: '10',
  l2Status: '11', l2Approver: '12', l2Date: '13',
  l3Status: '14', l3Approver: '15', l3Date: '16',
  l4Status: '17', l4Approver: '18', l4Date: '19',
  overallStatus: '20',
} as const;

// ─── Field ID map for form 260562114142344 (Content Publishing) ───────────────
const CP_FIELD = {
  requesterName: '2', email: '3', department: '4',
  contentType: '5', description: '6', priority: '7',
  publishDate: '8', attachments: '9', approvalStatus: '10',
} as const;

// ─── Field extractor ─────────────────────────────────────────────────────────
function extractText(answer: unknown): string {
  if (!answer) return '';
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'number') return String(answer);
  if (Array.isArray(answer)) return answer.filter(Boolean).join(', ');
  if (typeof answer === 'object') {
    const obj = answer as Record<string, string>;
    if (obj.first !== undefined || obj.last !== undefined)
      return [obj.first, obj.last].filter(Boolean).join(' ');
    if (obj.year && obj.month && obj.day)
      return `${obj.year}-${String(obj.month).padStart(2, '0')}-${String(obj.day).padStart(2, '0')}`;
    return Object.values(obj).filter(v => v && typeof v === 'string').join(' ');
  }
  return '';
}

// ─── Map a raw JotForm submission to our Submission model ─────────────────────
function mapJotFormSubmission(raw: Record<string, unknown>, workflowSteps: WorkflowStep[] = []): Submission {
  const answers = (raw.answers as Record<string, { answer: unknown; text?: string }>) || {};
  const get = (id: string) => extractText(answers[id]?.answer);

  const requesterName = get(FIELD.requesterName);
  const email = get(FIELD.email);
  const department = get(FIELD.department) || 'General';
  const description = get(FIELD.description) || FORM_TITLE;
  const amount = get(FIELD.amount);
  const priorityRaw = (get(FIELD.priority) || 'medium').toLowerCase();
  const priority = (['urgent', 'high', 'medium', 'low'].find(p => priorityRaw.includes(p)) || 'medium') as 'low' | 'medium' | 'high' | 'urgent';

  const levelDefs = [
    { level: 1, statusId: FIELD.l1Status, approverNameId: FIELD.l1Approver, dateId: FIELD.l1Date, title: 'Department Head' },
    { level: 2, statusId: FIELD.l2Status, approverNameId: FIELD.l2Approver, dateId: FIELD.l2Date, title: 'Division Manager' },
    { level: 3, statusId: FIELD.l3Status, approverNameId: FIELD.l3Approver, dateId: FIELD.l3Date, title: 'Director' },
    { level: 4, statusId: FIELD.l4Status, approverNameId: FIELD.l4Approver, dateId: FIELD.l4Date, title: 'Executive' },
  ];

  const history: ApprovalEntry[] = [];
  let currentLevel: ApprovalLevel | 'completed' | 'rejected' = 1;

  for (const def of levelDefs) {
    const statusVal = get(def.statusId);
    const approverName = get(def.approverNameId) || def.title;
    const date = get(def.dateId) || undefined;
    const s = statusVal.toLowerCase();

    if (s === 'approved') {
      history.push({ level: def.level as ApprovalLevel, approverName, status: 'approved', date });
      currentLevel = def.level === 4 ? 'completed' : (def.level + 1) as ApprovalLevel;
    } else if (s === 'rejected' || s === 'denied') {
      history.push({ level: def.level as ApprovalLevel, approverName, status: 'rejected', date });
      currentLevel = 'rejected';
      break;
    } else {
      // Pending or blank — stop here
      history.push({ level: def.level as ApprovalLevel, approverName, status: 'pending' });
      currentLevel = def.level as ApprovalLevel;
      break;
    }
  }

  const overallStatus = get(FIELD.overallStatus).toLowerCase();
  if (overallStatus.includes('complet')) currentLevel = 'completed';
  else if (overallStatus.includes('reject')) currentLevel = 'rejected';

  const createdAt = (raw.created_at as string) || '';
  // JotForm timestamps are UTC; normalize "YYYY-MM-DD HH:MM:SS" → ISO 8601
  const parseUTC = (s: string) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const submissionDate = createdAt ? parseUTC(createdAt) : new Date();
  const totalDays = Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));

  // Days at current level = time since the last approval date, or since submission if at level 1
  const lastApproval = [...history].reverse().find(h => h.status === 'approved' && h.date);
  const levelStartDate = lastApproval?.date ? parseUTC(lastApproval.date) : submissionDate;
  const daysAtCurrentLevel = Math.floor((Date.now() - levelStartDate.getTime()) / (1000 * 60 * 60 * 24));

  const id = String(raw.id);
  const editLink = String(raw.edit_link || '');
  // For completed/rejected submissions currentLevel is a string — getActionType
  // returns 'approval' for those (non-number), but the modal guards on
  // typeof currentApprovalLevel === 'number', so no action section is shown.
  const actionType = getActionType(workflowSteps, currentLevel);
  // Both taskUrl and formUrl point to the main form's inbox for this submission.
  // From the inbox, JotForm shows the appropriate native action button
  // ("View Task" or "View This Form") depending on the current workflow step.
  const taskUrl = `https://eforms.mediaoffice.ae/inbox/${FORM_ID}/${id}`;
  const formUrl = `https://eforms.mediaoffice.ae/inbox/${FORM_ID}/${id}`;

  const rawOverallStatus = get(FIELD.overallStatus);
  const jotformStatus = rawOverallStatus ||
    (currentLevel === 'completed' ? 'Completed' :
     currentLevel === 'rejected' ? 'Rejected' :
     history.some(h => h.status === 'approved') ? 'In Progress' : 'Pending');

  return {
    id,
    formId: FORM_ID,
    formTitle: FORM_TITLE,
    referenceNumber: `PO-${id.slice(-6)}`,
    title: description,
    description: `${description}${amount ? ' — AED ' + amount : ''}`,
    editLink: editLink || undefined,
    actionType,
    taskUrl,
    formUrl,
    submittedBy: { name: requesterName || 'Unknown', department, email },
    submissionDate: submissionDate.toISOString().slice(0, 10),
    currentApprovalLevel: currentLevel,
    approvalHistory: history,
    daysAtCurrentLevel,
    totalDaysSinceSubmission: totalDays,
    overallStatus: daysAtCurrentLevel > 7 ? 'critical' : daysAtCurrentLevel > 3 ? 'delayed' : 'on-track',
    jotformStatus,
    priority,
    answers: { description, amount, department, email, requester: requesterName },
  };
}

// ─── Map a raw Content Publishing submission to our Submission model ──────────
function mapContentPublishingSubmission(raw: Record<string, unknown>, workflowSteps: WorkflowStep[] = []): Submission {
  const answers = (raw.answers as Record<string, { answer: unknown; text?: string }>) || {};
  const get = (id: string) => extractText(answers[id]?.answer);

  const requesterName = get(CP_FIELD.requesterName);
  const email = get(CP_FIELD.email);
  const department = get(CP_FIELD.department) || 'General';
  const contentType = get(CP_FIELD.contentType);
  const description = get(CP_FIELD.description) || 'Content Request';
  const priorityRaw = (get(CP_FIELD.priority) || 'medium').toLowerCase();
  const priority = (['urgent', 'high', 'medium', 'low'].find(p => priorityRaw.includes(p)) || 'medium') as 'low' | 'medium' | 'high' | 'urgent';
  const approvalStatus = get(CP_FIELD.approvalStatus).toLowerCase();

  let currentLevel: ApprovalLevel | 'completed' | 'rejected' = 1;
  if (approvalStatus.includes('approved') || approvalStatus.includes('complet')) currentLevel = 'completed';
  else if (approvalStatus.includes('reject') || approvalStatus.includes('denied')) currentLevel = 'rejected';

  const history: ApprovalEntry[] = [{
    level: 1 as ApprovalLevel,
    approverName: 'Content Approver',
    status: currentLevel === 'completed' ? 'approved' : currentLevel === 'rejected' ? 'rejected' : 'pending',
  }];

  const createdAt = (raw.created_at as string) || '';
  const parseUTC = (s: string) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const submissionDate = createdAt ? parseUTC(createdAt) : new Date();
  const totalDays = Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));
  // For pending submissions, daysAtCurrentLevel = totalDays (single-level form).
  // For completed/rejected submissions, they are no longer waiting — use 0 so
  // they don't incorrectly appear as "critical" in the aging column.
  const daysAtCurrentLevel = typeof currentLevel === 'number' ? totalDays : 0;
  const id = String(raw.id);
  const editLink = String(raw.edit_link || '');
  // For completed/rejected submissions getActionType returns 'approval' (non-number
  // currentLevel) — the modal's typeof guard prevents showing action buttons.
  const actionType = getActionType(workflowSteps, currentLevel);
  const taskUrl = `https://eforms.mediaoffice.ae/inbox/${CONTENT_FORM_ID}/${id}`;
  const formUrl = `https://eforms.mediaoffice.ae/inbox/${CONTENT_FORM_ID}/${id}`;

  const rawApprovalStatus = get(CP_FIELD.approvalStatus);
  const cpJotformStatus = rawApprovalStatus ||
    (currentLevel === 'completed' ? 'Completed' :
     currentLevel === 'rejected' ? 'Rejected' : 'Pending');

  return {
    id,
    formId: CONTENT_FORM_ID,
    formTitle: CONTENT_FORM_TITLE,
    referenceNumber: `CP-${id.slice(-6)}`,
    title: `${contentType ? contentType + ' — ' : ''}${description}`,
    description,
    editLink: editLink || undefined,
    actionType,
    taskUrl,
    formUrl,
    submittedBy: { name: requesterName || 'Unknown', department, email },
    submissionDate: submissionDate.toISOString().slice(0, 10),
    currentApprovalLevel: currentLevel,
    approvalHistory: history,
    daysAtCurrentLevel,
    totalDaysSinceSubmission: totalDays,
    overallStatus: daysAtCurrentLevel > 7 ? 'critical' : daysAtCurrentLevel > 3 ? 'delayed' : 'on-track',
    jotformStatus: cpJotformStatus,
    priority,
    answers: { description, contentType, department, email, requester: requesterName },
  };
}

// ─── Map a raw Task Workflow (Test) submission to our Submission model ────────
// Form 260673958643066 — Level 1: approval, Level 2: task
// Known fields: Q3=Name (fullname), Q4=Email, Q5=File Upload
// No explicit approval-status fields — treat all submissions as pending at level 1
function mapTaskTestSubmission(raw: Record<string, unknown>, workflowSteps: WorkflowStep[] = []): Submission {
  const answers = (raw.answers as Record<string, { answer: unknown; text?: string }>) || {};
  const get = (id: string) => extractText(answers[id]?.answer);

  const requesterName = get('3');
  const email = get('4');
  const department = 'General';

  // Single pending approval history — no status field to read
  const currentLevel: ApprovalLevel | 'completed' | 'rejected' = 1;
  const history: ApprovalEntry[] = [{
    level: 1 as ApprovalLevel,
    approverName: 'Approver',
    status: 'pending',
  }];

  const createdAt = (raw.created_at as string) || '';
  const parseUTC = (s: string) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const submissionDate = createdAt ? parseUTC(createdAt) : new Date();
  const totalDays = Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysAtCurrentLevel = totalDays;

  const id = String(raw.id);
  const editLink = String(raw.edit_link || '');
  const actionType = getActionType(workflowSteps, currentLevel);
  const taskUrl = `https://eforms.mediaoffice.ae/inbox/${TASK_TEST_FORM_ID}/${id}`;
  const formUrl = `https://eforms.mediaoffice.ae/inbox/${TASK_TEST_FORM_ID}/${id}`;

  return {
    id,
    formId: TASK_TEST_FORM_ID,
    formTitle: TASK_TEST_FORM_TITLE,
    referenceNumber: `TT-${id.slice(-6)}`,
    title: requesterName ? `Task Request — ${requesterName}` : 'Task Request',
    description: requesterName ? `Task workflow request from ${requesterName}` : 'Task workflow test submission',
    editLink: editLink || undefined,
    actionType,
    taskUrl,
    formUrl,
    submittedBy: { name: requesterName || 'Unknown', department, email },
    submissionDate: submissionDate.toISOString().slice(0, 10),
    currentApprovalLevel: currentLevel,
    approvalHistory: history,
    daysAtCurrentLevel,
    totalDaysSinceSubmission: totalDays,
    overallStatus: daysAtCurrentLevel > 7 ? 'critical' : daysAtCurrentLevel > 3 ? 'delayed' : 'on-track',
    jotformStatus: 'Pending',
    priority: 'medium',
    answers: { description: '', department, email, requester: requesterName },
  };
}

// ─── Map any JotForm submission using heuristically-detected fields ───────────
function mapGenericSubmission(
  raw: Record<string, unknown>,
  formId: string,
  formTitle: string,
  fields: DetectedFields,
  workflowSteps: WorkflowStep[] = []
): Submission {
  const answers = (raw.answers as Record<string, { answer: unknown; text?: string }>) || {};
  const get = (id: string | null) => id ? extractText(answers[id]?.answer) : '';

  const requesterName = get(fields.nameFieldId);
  const email = get(fields.emailFieldId);
  const department = get(fields.deptFieldId) || 'General';
  const description = get(fields.descFieldId) || formTitle;
  const amount = get(fields.amountFieldId);
  const priorityRaw = (get(fields.priorityFieldId) || 'medium').toLowerCase();
  const priority = (['urgent', 'high', 'medium', 'low'].find(p => priorityRaw.includes(p)) || 'medium') as 'low' | 'medium' | 'high' | 'urgent';

  const history: ApprovalEntry[] = [];
  let currentLevel: ApprovalLevel | 'completed' | 'rejected' = 1 as ApprovalLevel;

  if (fields.levelFields.length > 0) {
    for (const lf of fields.levelFields) {
      const statusVal = get(lf.statusFieldId).toLowerCase();
      const approverName = get(lf.approverFieldId) || `Level ${lf.level} Approver`;
      const date = get(lf.dateFieldId) || undefined;
      if (statusVal === 'approved') {
        history.push({ level: lf.level as ApprovalLevel, approverName, status: 'approved', date });
        const isLast = lf.level === fields.levelFields[fields.levelFields.length - 1].level;
        currentLevel = isLast ? 'completed' : (lf.level + 1) as ApprovalLevel;
      } else if (statusVal === 'rejected' || statusVal === 'denied') {
        history.push({ level: lf.level as ApprovalLevel, approverName, status: 'rejected', date });
        currentLevel = 'rejected';
        break;
      } else {
        history.push({ level: lf.level as ApprovalLevel, approverName, status: 'pending' });
        currentLevel = lf.level as ApprovalLevel;
        break;
      }
    }
  } else {
    // Single-level: read overall status field
    const overall = get(fields.overallStatusFieldId).toLowerCase();
    if (overall.includes('approved') || overall.includes('complet')) currentLevel = 'completed';
    else if (overall.includes('reject') || overall.includes('denied')) currentLevel = 'rejected';
    else currentLevel = 1 as ApprovalLevel;

    const histStatus = typeof currentLevel === 'number' ? 'pending' : currentLevel === 'completed' ? 'approved' : 'rejected';
    history.push({ level: 1 as ApprovalLevel, approverName: 'Approver', status: histStatus });
  }

  // Overall status field can override level computation
  const overallFinal = get(fields.overallStatusFieldId).toLowerCase();
  if (overallFinal.includes('complet')) currentLevel = 'completed';
  else if (overallFinal.includes('reject')) currentLevel = 'rejected';

  const createdAt = (raw.created_at as string) || '';
  const parseUTC = (s: string) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  const submissionDate = createdAt ? parseUTC(createdAt) : new Date();
  const totalDays = Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));

  const lastApproval = [...history].reverse().find(h => h.status === 'approved' && h.date);
  const levelStartDate = lastApproval?.date ? parseUTC(lastApproval.date) : submissionDate;
  const daysAtCurrentLevel = typeof currentLevel === 'number'
    ? Math.floor((Date.now() - levelStartDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const id = String(raw.id);
  const editLink = String(raw.edit_link || '');
  const actionType = getActionType(workflowSteps, currentLevel);
  const inboxUrl = `https://eforms.mediaoffice.ae/inbox/${formId}/${id}`;
  const prefix = formTitle.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 3) || 'WF';

  const rawGenericStatus = get(fields.overallStatusFieldId);
  const genericJotformStatus = rawGenericStatus ||
    (currentLevel === 'completed' ? 'Completed' :
     currentLevel === 'rejected' ? 'Rejected' :
     history.some(h => h.status === 'approved') ? 'In Progress' : 'Pending');

  return {
    id,
    formId,
    formTitle,
    referenceNumber: `${prefix}-${id.slice(-6)}`,
    title: description,
    description: `${description}${amount ? ' — AED ' + amount : ''}`,
    editLink: editLink || undefined,
    actionType,
    taskUrl: inboxUrl,
    formUrl: inboxUrl,
    submittedBy: { name: requesterName || 'Unknown', department, email },
    submissionDate: submissionDate.toISOString().slice(0, 10),
    currentApprovalLevel: currentLevel,
    approvalHistory: history,
    daysAtCurrentLevel,
    totalDaysSinceSubmission: totalDays,
    overallStatus: daysAtCurrentLevel > 7 ? 'critical' : daysAtCurrentLevel > 3 ? 'delayed' : 'on-track',
    jotformStatus: genericJotformStatus,
    priority,
    answers: { description, amount, department, email, requester: requesterName },
    levelFieldMap: fields.levelFields.length > 0
      ? fields.levelFields.map(lf => ({
          level: lf.level,
          statusFieldId: lf.statusFieldId,
          approverFieldId: lf.approverFieldId,
          overallStatusFieldId: fields.overallStatusFieldId,
        }))
      : fields.overallStatusFieldId
        ? [{ level: 1, statusFieldId: fields.overallStatusFieldId, approverFieldId: null, overallStatusFieldId: fields.overallStatusFieldId }]
        : undefined,
  };
}

// ─── Map a Supabase row back to a Submission ──────────────────────────────────
function mapSupabaseRow(row: Record<string, unknown>): Submission {
  const raw = (row.raw_data as Record<string, unknown>) || {};

  // If raw_data has the full JotForm answers, use them
  if (raw.answers) {
    return mapJotFormSubmission({ ...raw, id: row.jotform_submission_id });
  }

  // Fallback: use the pre-mapped fields from Supabase
  const mapped = (raw._mapped as Record<string, unknown>) || {};
  const levels = (mapped.levels as Array<{ id: number; status: string; approver: string; date?: string }>) || [];
  const history: ApprovalEntry[] = levels.map(l => ({
    level: l.id as ApprovalLevel,
    approverName: l.approver || `Level ${l.id} Approver`,
    status: (l.status?.toLowerCase() === 'approved' ? 'approved' : l.status?.toLowerCase() === 'rejected' ? 'rejected' : 'pending') as 'approved' | 'rejected' | 'pending',
    date: l.date || undefined,
  }));

  const totalDays = Number(row.total_days) || 0;
  const status = String(row.status || 'pending');
  const currentLevel: ApprovalLevel | 'completed' | 'rejected' =
    status === 'completed' ? 'completed' : status === 'rejected' ? 'rejected' : (Number(row.current_level) || 1) as ApprovalLevel;

  const sbId = String(row.jotform_submission_id);
  const sbFormId = String(row.form_id || FORM_ID);

  return {
    id: sbId,
    formId: sbFormId,
    formTitle: FORM_TITLE,
    referenceNumber: `PO-${sbId.slice(-6)}`,
    title: String(row.title || 'Purchase Order'),
    description: String(row.title || 'Purchase Order'),
    actionType: 'approval' as WorkflowActionType,
    taskUrl: `https://eforms.mediaoffice.ae/inbox/${sbFormId}/${sbId}`,
    formUrl: `https://eforms.mediaoffice.ae/inbox/${sbFormId}/${sbId}`,
    submittedBy: {
      name: String(row.submitted_by || 'Unknown'),
      department: String(row.department || 'General'),
      email: String((mapped.email as string) || ''),
    },
    submissionDate: String(row.submission_date || new Date().toISOString()).slice(0, 10),
    currentApprovalLevel: currentLevel,
    approvalHistory: history,
    daysAtCurrentLevel: totalDays,
    totalDaysSinceSubmission: totalDays,
    overallStatus: totalDays > 7 ? 'critical' : totalDays > 3 ? 'delayed' : 'on-track',
    jotformStatus: String(row.status || (currentLevel === 'completed' ? 'Completed' : currentLevel === 'rejected' ? 'Rejected' : 'Pending')),
    priority: 'medium',
    answers: { description: String(row.title || ''), amount: String((mapped.amount as string) || ''), department: String(row.department || ''), email: String((mapped.email as string) || ''), requester: String(row.submitted_by || '') },
  } as Submission;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSubmissions() {
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [activeForms, setActiveForms] = useState<JFFormMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshConfig, setRefreshConfig] = useState<RefreshConfig>({
    autoRefresh: true,
    intervalMinutes: 5,
    lastUpdated: null,
  });

  const [filters, setFilters] = useState<FilterConfig>(() => {
    try {
      const saved = localStorage.getItem('jotflow_filters');
      return saved ? { ...{ approvalLevel: '', department: '', status: '', dateFrom: '', dateTo: '', search: '' }, ...JSON.parse(saved) } : { approvalLevel: '', department: '', status: '', dateFrom: '', dateTo: '', search: '' };
    } catch { return { approvalLevel: '', department: '', status: '', dateFrom: '', dateTo: '', search: '' }; }
  });
  const wrappedSetFilters = (updater: FilterConfig | ((prev: FilterConfig) => FilterConfig)) => {
    setFilters(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('jotflow_filters', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [sort, setSort] = useState<SortConfig>({ key: 'submissionDate', direction: 'desc' });
  const [pagination, setPagination] = useState<PaginationConfig>({ page: 1, perPage: 25, total: 0 });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // ── Phase 1: show Supabase cache instantly ──────────────────────────────
    // Supabase responds in ~100 ms, so the dashboard appears immediately
    // instead of waiting 3-5 s for the JotForm API.
    let hasCachedData = false;
    try {
      const { data: sbRows } = await supabase
        .from('jf_submissions')
        .select('*')
        .order('submission_date', { ascending: false });
      if (sbRows && sbRows.length > 0) {
        setAllSubmissions(sbRows.map(r => mapSupabaseRow(r as Record<string, unknown>)));
        setLoading(false); // dashboard visible immediately
        hasCachedData = true;
      }
    } catch {
      // Supabase unavailable — will stay in loading until JotForm responds
    }

    // ── Phase 2: discover all enabled forms, fetch submissions dynamically ──
    // No loading flash — if Phase 1 already showed data, this just swaps it.
    try {
      fetch('/api/sync').catch(err => console.warn('[JotFlow] Sync failed:', err));

      // Discover all enabled JotForm workflows for this account
      const forms = await fetchUserForms();
      if (forms.length > 0) setActiveForms(forms);

      // Fetch submissions + questions for all forms in parallel
      const formResults = await Promise.all(
        forms.map(async (form) => {
          const [subsRes, questions] = await Promise.all([
            fetch(`/api/jotform?path=form/${form.id}/submissions&limit=1000&orderby=created_at&direction=DESC`),
            fetchFormQuestions(form.id),
          ]);
          const subsData = subsRes.ok ? await subsRes.json() : null;
          const rows: Record<string, unknown>[] = subsData?.content || [];
          const detectedFields = detectFields(questions);
          const steps = await fetchWorkflowSteps(form.id);
          return { form, rows, detectedFields, steps };
        })
      );

      const totalRows = formResults.reduce((sum, r) => sum + r.rows.length, 0);

      if (totalRows > 0) {
        const mapped: Submission[] = [];
        for (const { form, rows, detectedFields, steps } of formResults) {
          for (const raw of rows) {
            // Use specific mappers for known forms; generic mapper for all others
            if (form.id === FORM_ID) {
              mapped.push(mapJotFormSubmission(raw, steps));
            } else if (form.id === CONTENT_FORM_ID) {
              mapped.push(mapContentPublishingSubmission(raw, steps));
            } else if (form.id === TASK_TEST_FORM_ID) {
              mapped.push(mapTaskTestSubmission(raw, steps));
            } else {
              mapped.push(mapGenericSubmission(raw, form.id, form.title, detectedFields, steps));
            }
          }
        }
        setAllSubmissions(mapped);
        setRefreshConfig(prev => ({ ...prev, lastUpdated: new Date().toISOString() }));
      } else if (forms.length === 0 && !hasCachedData) {
        setError('No JotForm workflows found. Please ensure your JotForm account has enabled forms.');
      } else if (totalRows === 0 && !hasCachedData) {
        setError('Live data unavailable — showing cached data');
      }
    } catch (err: unknown) {
      if (!hasCachedData) {
        setError(err instanceof Error ? err.message : String(err));
        setAllSubmissions([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh
  useEffect(() => {
    if (!refreshConfig.autoRefresh) return;
    const interval = setInterval(loadData, refreshConfig.intervalMinutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshConfig.autoRefresh, refreshConfig.intervalMinutes, loadData]);

  // ─── Filtering / sorting / pagination ─────────────────────────────────────
  const filteredSubmissions = useMemo(() => {
    let result = [...allSubmissions];
    if (filters.approvalLevel) {
      const level = filters.approvalLevel === 'completed' ? 'completed'
        : filters.approvalLevel === 'rejected' ? 'rejected'
        : Number(filters.approvalLevel);
      result = result.filter(s => s.currentApprovalLevel === level);
    }
    if (filters.department) result = result.filter(s => s.submittedBy.department === filters.department);
    if (filters.status) result = result.filter(s => s.jotformStatus?.toLowerCase().includes(filters.status.toLowerCase()));
    if (filters.dateFrom) result = result.filter(s => s.submissionDate >= filters.dateFrom);
    if (filters.dateTo) result = result.filter(s => s.submissionDate <= filters.dateTo);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.referenceNumber.toLowerCase().includes(q) ||
        s.submittedBy.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.formId.toLowerCase().includes(q) ||
        s.formTitle.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sort.key];
      const bVal = (b as unknown as Record<string, unknown>)[sort.key];
      const cmp = String(aVal || '').localeCompare(String(bVal || ''), undefined, { numeric: true });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [allSubmissions, filters, sort]);

  useEffect(() => {
    setPagination(prev => ({ ...prev, total: filteredSubmissions.length, page: 1 }));
  }, [filteredSubmissions.length]);

  const paginatedSubmissions = useMemo(() => {
    const start = (pagination.page - 1) * pagination.perPage;
    return filteredSubmissions.slice(start, start + pagination.perPage);
  }, [filteredSubmissions, pagination.page, pagination.perPage]);

  const stats = useMemo(() => getDashboardStats(allSubmissions), [allSubmissions]);
  const approvalStats = useMemo(() => getApprovalLevelStats(allSubmissions), [allSubmissions]);
  const departmentStats = useMemo(() => getDepartmentStats(allSubmissions), [allSubmissions]);
  const trendData = useMemo(() => getTrendData(allSubmissions), [allSubmissions]);
  const bottleneckData = useMemo(() => getBottleneckData(allSubmissions), [allSubmissions]);
  const heatmapData = useMemo(() => getHeatmapData(allSubmissions), [allSubmissions]);

  return {
    allSubmissions, filteredSubmissions, paginatedSubmissions,
    activeForms,
    loading, error,
    stats, approvalStats, departmentStats, trendData, bottleneckData, heatmapData,
    filters, setFilters: wrappedSetFilters,
    sort, setSort,
    pagination, setPagination,
    refreshConfig, setRefreshConfig,
    refresh: loadData,
  };
}
