import { useState, useEffect, useCallback, useMemo } from 'react';
import { Submission, ApprovalEntry, ApprovalLevel, FilterConfig, SortConfig, PaginationConfig, RefreshConfig } from '../types';
import { getDashboardStats, getApprovalLevelStats, getDepartmentStats, getTrendData, getBottleneckData, getHeatmapData } from '../services/mockData';

const FORM_ID = '260562405560351';

// Map JotForm field IDs to approval levels
const LEVEL_MAP: Record<number, { statusField: string; approverField: string; dateField: string }> = {
  1: { statusField: '8',  approverField: '9',  dateField: '10' },
  2: { statusField: '11', approverField: '12', dateField: '13' },
  3: { statusField: '14', approverField: '15', dateField: '16' },
  4: { statusField: '17', approverField: '18', dateField: '19' },
};

function mapJotFormSubmission(raw: Record<string, unknown>): Submission {
  const answers = (raw.answers as Record<string, { answer: unknown; text?: string; prettyFormat?: string }>) || {};
  const get = (fieldId: string): string => {
    const a = answers[fieldId];
    if (!a) return '';
    const v = a.answer;
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (v && typeof v === 'object') return (a.prettyFormat || JSON.stringify(v));
    return '';
  };

  // Build approval history
  const history: ApprovalEntry[] = [];
  let currentLevel: ApprovalLevel | 'completed' | 'rejected' = 1;

  for (const [lvl, fields] of Object.entries(LEVEL_MAP)) {
    const level = Number(lvl) as ApprovalLevel;
    const status = get(fields.statusField).toLowerCase();
    const approverName = get(fields.approverField) || `Level ${level} Approver`;
    const dateRaw = answers[fields.dateField]?.answer as Record<string, string> | string | undefined;
    let date: string | undefined;
    if (dateRaw && typeof dateRaw === 'object' && dateRaw.month && dateRaw.day && dateRaw.year) {
      date = `${dateRaw.year}-${String(dateRaw.month).padStart(2,'0')}-${String(dateRaw.day).padStart(2,'0')}`;
    } else if (typeof dateRaw === 'string' && dateRaw) {
      date = dateRaw;
    }

    if (status === 'approved') {
      history.push({ level, approverName, status: 'approved', date });
      currentLevel = (level + 1) as ApprovalLevel;
      if (level === 4) currentLevel = 'completed';
    } else if (status === 'rejected') {
      history.push({ level, approverName, status: 'rejected', date });
      currentLevel = 'rejected';
      break;
    } else {
      history.push({ level, approverName, status: 'pending' });
      currentLevel = level;
      break;
    }
  }

  // Overall status from JotForm field 20
  const overallStatusRaw = get('20').toLowerCase();
  const overallStatus =
    overallStatusRaw === 'completed' || currentLevel === 'completed' ? 'on-track' :
    overallStatusRaw === 'rejected' || currentLevel === 'rejected' ? 'on-track' :
    'on-track';

  // Days calculation
  const createdAt = raw.created_at as string || '';
  const submissionDate = createdAt ? new Date(createdAt) : new Date();
  const totalDays = Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24));

  // Requester
  const nameRaw = answers['2']?.answer as Record<string, string> | string | undefined;
  let requesterName = '';
  if (nameRaw && typeof nameRaw === 'object') {
    requesterName = [nameRaw.first, nameRaw.last].filter(Boolean).join(' ');
  } else if (typeof nameRaw === 'string') {
    requesterName = nameRaw;
  }

  const dept = get('4') || 'General';
  const email = get('3') || '';
  const description = get('5') || 'Purchase Order';
  const amount = get('6');
  const priority = get('7').toLowerCase() as 'low' | 'medium' | 'high' | 'urgent' || 'medium';

  return {
    id: raw.id as string,
    formId: FORM_ID,
    formTitle: 'Purchase Order Approval',
    referenceNumber: `PO-${String(raw.id).slice(-6)}`,
    title: description || 'Purchase Order',
    description: `${description}${amount ? ' — ' + amount + ' AED' : ''}`,
    submittedBy: { name: requesterName || 'Unknown', department: dept, email },
    submissionDate: submissionDate.toISOString().slice(0, 10),
    currentApprovalLevel: currentLevel,
    approvalHistory: history,
    daysAtCurrentLevel: totalDays,
    totalDaysSinceSubmission: totalDays,
    overallStatus: totalDays > 7 ? 'critical' : totalDays > 3 ? 'delayed' : 'on-track',
    priority: ['low','medium','high','urgent'].includes(priority) ? priority : 'medium',
    answers: { description, amount, department: dept, email, requester: requesterName },
  };
}

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
      const res = await fetch(`/api/jotform?path=form/${FORM_ID}/submissions&limit=1000`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const raw: Record<string, unknown>[] = data.content || [];
      const mapped = raw.map(mapJotFormSubmission);
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
