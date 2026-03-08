import { useState, useEffect, useCallback, useMemo } from 'react';
import { Submission, ApprovalEntry, ApprovalLevel, FilterConfig, SortConfig, PaginationConfig, RefreshConfig } from '../types';
import { getDashboardStats, getApprovalLevelStats, getDepartmentStats, getTrendData, getBottleneckData, getHeatmapData } from '../services/mockData';
import { supabase } from '../lib/supabase';

// ─── The live form we track ───────────────────────────────────────────────────
const FORM_ID = '260562405560351';
const FORM_TITLE = 'Purchase Order Approval';

// ─── Field ID map for form 260562405560351 ────────────────────────────────────
const FIELD = {
  requesterName: '2', email: '3', department: '4',
  description: '5', amount: '6', priority: '7',
  l1Status: '8', l1Approver: '9', l1Date: '10',
  l2Status: '11', l2Approver: '12', l2Date: '13',
  l3Status: '14', l3Approver: '15', l3Date: '16',
  l4Status: '17', l4Approver: '18', l4Date: '19',
  overallStatus: '20',
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
function mapJotFormSubmission(raw: Record<string, unknown>): Submission {
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
  const submissionDate = createdAt ? new Date(createdAt.replace(' ', 'T') + 'Z') : new Date();
  const totalDays = Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));

  const id = String(raw.id);

  return {
    id,
    formId: FORM_ID,
    formTitle: FORM_TITLE,
    referenceNumber: `PO-${id.slice(-6)}`,
    title: description,
    description: `${description}${amount ? ' — AED ' + amount : ''}`,
    submittedBy: { name: requesterName || 'Unknown', department, email },
    submissionDate: submissionDate.toISOString().slice(0, 10),
    currentApprovalLevel: currentLevel,
    approvalHistory: history,
    daysAtCurrentLevel: totalDays,
    totalDaysSinceSubmission: totalDays,
    overallStatus: totalDays > 7 ? 'critical' : totalDays > 3 ? 'delayed' : 'on-track',
    priority,
    answers: { description, amount, department, email, requester: requesterName },
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

  return {
    id: String(row.jotform_submission_id),
    formId: String(row.form_id || FORM_ID),
    formTitle: FORM_TITLE,
    referenceNumber: `PO-${String(row.jotform_submission_id).slice(-6)}`,
    title: String(row.title || 'Purchase Order'),
    description: String(row.title || 'Purchase Order'),
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
    priority: 'medium',
    answers: { description: String(row.title || ''), amount: String((mapped.amount as string) || ''), department: String(row.department || ''), email: String((mapped.email as string) || ''), requester: String(row.submitted_by || '') },
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useSubmissions() {
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshConfig, setRefreshConfig] = useState<RefreshConfig>({
    autoRefresh: true,
    intervalMinutes: 5,
    lastUpdated: null,
  });

  const [filters, setFilters] = useState<FilterConfig>({
    approvalLevel: '', department: '', status: '', dateFrom: '', dateTo: '', search: '',
  });
  const [sort, setSort] = useState<SortConfig>({ key: 'submissionDate', direction: 'desc' });
  const [pagination, setPagination] = useState<PaginationConfig>({ page: 1, perPage: 25, total: 0 });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: trigger server-side sync (JotForm → Supabase)
      // Fire-and-forget — we'll read from Supabase after
      fetch('/api/sync').catch(() => {});

      // Step 2: fetch directly from JotForm (always fresh)
      const jfRes = await fetch(`/api/jotform?path=form/${FORM_ID}/submissions&limit=1000&orderby=created_at&direction=DESC`);
      if (jfRes.ok) {
        const jfData = await jfRes.json();
        const rows: Record<string, unknown>[] = jfData.content || [];
        if (rows.length > 0) {
          const mapped = rows.map(r => mapJotFormSubmission(r));
          setAllSubmissions(mapped);
          setRefreshConfig(prev => ({ ...prev, lastUpdated: new Date().toISOString() }));
          setLoading(false);
          return;
        }
      }

      // Fallback: read from Supabase
      const { data: sbRows, error: sbError } = await supabase
        .from('jf_submissions')
        .select('*')
        .eq('form_id', FORM_ID)
        .order('submission_date', { ascending: false });

      if (sbError) throw new Error(sbError.message);
      const mapped = (sbRows || []).map(r => mapSupabaseRow(r as Record<string, unknown>));
      setAllSubmissions(mapped);
      setRefreshConfig(prev => ({ ...prev, lastUpdated: new Date().toISOString() }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setAllSubmissions([]);
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
    if (filters.status) result = result.filter(s => s.overallStatus === filters.status);
    if (filters.dateFrom) result = result.filter(s => s.submissionDate >= filters.dateFrom);
    if (filters.dateTo) result = result.filter(s => s.submissionDate <= filters.dateTo);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.referenceNumber.toLowerCase().includes(q) ||
        s.submittedBy.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
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
    loading, error,
    stats, approvalStats, departmentStats, trendData, bottleneckData, heatmapData,
    filters, setFilters,
    sort, setSort,
    pagination, setPagination,
    refreshConfig, setRefreshConfig,
    refresh: loadData,
  };
}
