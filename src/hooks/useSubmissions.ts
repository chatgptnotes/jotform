import { useState, useEffect, useCallback, useMemo } from 'react';
import { Submission, ApprovalEntry, ApprovalLevel, FilterConfig, SortConfig, PaginationConfig, RefreshConfig } from '../types';
import { getDashboardStats, getApprovalLevelStats, getDepartmentStats, getTrendData, getBottleneckData, getHeatmapData } from '../services/mockData';

// Form IDs to load — leave empty for auto-discovery (fetches ALL forms in the account)
const PINNED_FORM_IDS: string[] = [];

// ─── Generic field extractor ──────────────────────────────────────────────────
// Maps ANY JotForm submission to our Submission model using field LABELS not IDs

function extractText(answer: unknown): string {
  if (!answer) return '';
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'number') return String(answer);
  if (Array.isArray(answer)) return answer.filter(Boolean).join(', ');
  if (typeof answer === 'object') {
    const obj = answer as Record<string, string>;
    // Name object: { first, last }
    if (obj.first || obj.last) return [obj.first, obj.last].filter(Boolean).join(' ');
    // Date object: { month, day, year }
    if (obj.year && obj.month && obj.day) return `${obj.year}-${String(obj.month).padStart(2,'0')}-${String(obj.day).padStart(2,'0')}`;
    // Fallback: join values
    return Object.values(obj).filter(v => v && typeof v === 'string').join(' ');
  }
  return '';
}

function labelMatch(label: string, ...keywords: string[]): boolean {
  const l = label.toLowerCase();
  return keywords.some(k => l.includes(k));
}

function mapGenericSubmission(raw: Record<string, unknown>, formTitle: string): Submission {
  const answers = (raw.answers as Record<string, { answer: unknown; text?: string; prettyFormat?: string }>) || {};

  // Build label → value map
  const byLabel: Record<string, string> = {};
  // Build fieldId → value map
  const byId: Record<string, string> = {};
  for (const [fid, ans] of Object.entries(answers)) {
    const val = extractText(ans.answer);
    byId[fid] = val;
    if (ans.text) {
      byLabel[ans.text.toLowerCase()] = val;
    }
  }

  // Helper: find value by label keywords
  const findByLabel = (...keywords: string[]): string => {
    for (const [label, val] of Object.entries(byLabel)) {
      if (labelMatch(label, ...keywords)) return val;
    }
    return '';
  };

  // Requester info
  let requesterName = findByLabel('requester name', 'your name', 'full name', 'submitted by');
  if (!requesterName) {
    // Try finding name field with first/last structure
    for (const ans of Object.values(answers)) {
      const obj = ans.answer as Record<string, string>;
      if (obj && typeof obj === 'object' && (obj.first || obj.last)) {
        requesterName = [obj.first, obj.last].filter(Boolean).join(' ');
        break;
      }
    }
  }

  const email = findByLabel('email', 'e-mail') || '';
  const department = findByLabel('department', 'dept', 'division', 'section') || 'General';
  const description = findByLabel('description', 'content', 'purchase', 'subject', 'title', 'detail') || formTitle;
  const amount = findByLabel('amount', 'value', 'cost', 'budget', 'aed', 'price') || '';
  const priorityRaw = findByLabel('priority', 'urgency', 'urgency level').toLowerCase();
  const priority = (['urgent', 'high', 'medium', 'low'].find(p => priorityRaw.includes(p)) || 'medium') as 'low' | 'medium' | 'high' | 'urgent';

  // ─── Approval history ─────────────────────────────────────────────────────
  const history: ApprovalEntry[] = [];
  let currentLevel: ApprovalLevel | 'completed' | 'rejected' = 1;

  // Check for multi-level approval fields (labeled "Level N" or "Level N - ...")
  const levelEntries: Array<{ level: number; status: string; approverName: string; date?: string }> = [];

  // Try to find level-specific fields
  for (let lvl = 1; lvl <= 4; lvl++) {
    let statusVal = '';
    let approverVal = '';
    let dateVal = '';

    for (const [label, val] of Object.entries(byLabel)) {
      if (label.includes(`level ${lvl}`) || label.startsWith(`l${lvl} `)) {
        if (labelMatch(label, 'approval', 'status', 'review', 'decision') && !labelMatch(label, 'name', 'date', 'approver')) {
          statusVal = val;
        }
        if (labelMatch(label, 'approver', 'name', 'approved by', 'reviewer')) {
          approverVal = val;
        }
        if (labelMatch(label, 'date', 'time')) {
          dateVal = val;
        }
      }
    }

    if (statusVal || approverVal) {
      levelEntries.push({
        level: lvl,
        status: statusVal,
        approverName: approverVal || `Level ${lvl} Approver`,
        date: dateVal || undefined,
      });
    }
  }

  if (levelEntries.length > 0) {
    // Multi-level approval form (e.g. Purchase Order)
    for (const entry of levelEntries) {
      const s = entry.status.toLowerCase();
      if (s === 'approved') {
        history.push({ level: entry.level as ApprovalLevel, approverName: entry.approverName, status: 'approved', date: entry.date });
        currentLevel = (entry.level + 1) as ApprovalLevel;
        if (entry.level === 4) currentLevel = 'completed';
      } else if (s === 'rejected' || s === 'denied') {
        history.push({ level: entry.level as ApprovalLevel, approverName: entry.approverName, status: 'rejected', date: entry.date });
        currentLevel = 'rejected';
        break;
      } else {
        history.push({ level: entry.level as ApprovalLevel, approverName: entry.approverName, status: 'pending' });
        currentLevel = entry.level as ApprovalLevel;
        break;
      }
    }
  } else {
    // Single-level or simple approval (e.g. Content Publishing)
    const overallStatus = findByLabel('approval status', 'overall status', 'status').toLowerCase();
    const approverName = findByLabel('approver', 'approved by', 'reviewer') || 'Approver';

    if (overallStatus === 'approved' || overallStatus === 'completed') {
      history.push({ level: 1, approverName, status: 'approved' });
      currentLevel = 'completed';
    } else if (overallStatus === 'rejected' || overallStatus === 'denied') {
      history.push({ level: 1, approverName, status: 'rejected' });
      currentLevel = 'rejected';
    } else {
      // "Under Review", "Pending", etc. — pending at level 1
      history.push({ level: 1, approverName: 'BK (Bettroi)', status: 'pending' });
      currentLevel = 1;
    }
  }

  // Days calculation
  const createdAt = (raw.created_at as string) || '';
  const submissionDate = createdAt ? new Date(createdAt) : new Date();
  const totalDays = Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    id: raw.id as string,
    formId: (raw.__formId as string) || '',
    formTitle,
    referenceNumber: `${formTitle.split(' ').map(w => w[0]).join('').slice(0,4).toUpperCase()}-${String(raw.id).slice(-6)}`,
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubmissions() {
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshConfig, setRefreshConfig] = useState<RefreshConfig>({
    autoRefresh: false,
    intervalMinutes: 15,
    lastUpdated: null,
  });

  const [filters, setFilters] = useState<FilterConfig>({
    approvalLevel: '',
    department: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });

  const [sort, setSort] = useState<SortConfig>({ key: 'submissionDate', direction: 'desc' });
  const [pagination, setPagination] = useState<PaginationConfig>({ page: 1, perPage: 25, total: 0 });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: discover all forms
      let formList: { id: string; title: string }[] = PINNED_FORM_IDS.map(id => ({ id, title: '' }));

      if (formList.length === 0) {
        const formsRes = await fetch('/api/jotform?path=user/forms&limit=100&orderby=created_at&direction=DESC');
        if (formsRes.ok) {
          const formsData = await formsRes.json();
          formList = (formsData.content || []).map((f: Record<string, unknown>) => ({
            id: String(f.id),
            title: String(f.title || 'Form'),
          }));
        }
      }

      // Step 2: fetch submissions from each form
      const allRaw: Array<Record<string, unknown> & { __formId: string; __formTitle: string }> = [];
      for (const form of formList) {
        try {
          const res = await fetch(`/api/jotform?path=form/${form.id}/submissions&limit=1000`);
          if (!res.ok) continue;
          const data = await res.json();
          const rows: Record<string, unknown>[] = data.content || [];
          rows.forEach(r => {
            (r as any).__formId = form.id;
            (r as any).__formTitle = form.title;
          });
          allRaw.push(...(rows as any[]));
        } catch { /* skip failing form */ }
      }

      // Step 3: map each submission generically
      const mapped = allRaw.map(r => mapGenericSubmission(r, (r.__formTitle as string) || 'Form'));
      setAllSubmissions(mapped);
      setRefreshConfig(prev => ({ ...prev, lastUpdated: new Date().toISOString() }));
    } catch (err: any) {
      setError(err.message);
      setAllSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!refreshConfig.autoRefresh) return;
    const interval = setInterval(loadData, refreshConfig.intervalMinutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshConfig.autoRefresh, refreshConfig.intervalMinutes, loadData]);

  const filteredSubmissions = useMemo(() => {
    let result = [...allSubmissions];
    if (filters.approvalLevel) {
      const level = filters.approvalLevel === 'completed' ? 'completed' :
        filters.approvalLevel === 'rejected' ? 'rejected' : Number(filters.approvalLevel);
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
