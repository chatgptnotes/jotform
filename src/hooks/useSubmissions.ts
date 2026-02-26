import { useState, useEffect, useCallback, useMemo } from 'react';
import { Submission, ApprovalLevel, FilterConfig, SortConfig, PaginationConfig, RefreshConfig } from '../types';
import { getDashboardStats, getApprovalLevelStats, getDepartmentStats, getTrendData, getBottleneckData, getHeatmapData, APPROVERS } from '../services/mockData';
import jotformApi from '../services/jotformApi';

const DEPARTMENTS = ['Communications', 'Digital Media', 'Marketing', 'Events', 'Public Relations', 'Executive Office', 'IT', 'HR', 'Finance', 'Operations', 'Legal', 'Admin'];
const FORM_TYPES = ['Content Publishing', 'Media Event', 'IT Support', 'Leave Request', 'Budget Request', 'Travel Authorization', 'Vendor Registration', 'Contract Renewal'];

function transformJotformSubmission(raw: Record<string, unknown>, formTitle: string, formId: string): Submission {
  const answers = raw.answers as Record<string, Record<string, unknown>> || {};
  const createdAt = (raw.created_at as string) || new Date().toISOString();
  const submissionId = String(raw.id || Math.random());

  // Extract fields from answers
  let name = 'Unknown';
  let email = '';
  let department = '';
  let description = '';
  let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
  let title = formTitle;
  let overallStatus = '';

  // Multi-level approval tracking
  const levelApprovals: Record<number, { status: string; approver: string }> = {};

  for (const [, field] of Object.entries(answers)) {
    const type = field.type as string;
    const text = (field.text as string || '');
    const textLower = text.toLowerCase();
    const answer = field.answer;

    if (type === 'control_fullname' && answer && typeof answer === 'object') {
      const a = answer as Record<string, string>;
      name = [a.first, a.last].filter(Boolean).join(' ') || name;
    } else if (type === 'control_email' && answer) {
      email = String(answer);
    } else if (type === 'control_dropdown') {
      // Check level approval FIRST (before department, since "Level 1 - Department Head" contains "department")
      const levelMatch = textLower.match(/level\s*(\d)/);
      if (levelMatch && (textLower.includes('approval') || textLower.includes('status'))) {
        const lvl = parseInt(levelMatch[1]);
        if (!levelApprovals[lvl]) levelApprovals[lvl] = { status: '', approver: '' };
        levelApprovals[lvl].status = String(answer || 'Pending');
      } else if (textLower === 'department' || (textLower.includes('department') && !textLower.includes('level'))) {
        department = String(answer || '');
      } else if (textLower.includes('priority')) {
        priority = (String(answer || 'medium').toLowerCase() as 'low' | 'medium' | 'high' | 'urgent');
      } else if (textLower.includes('overall status') && answer) {
        overallStatus = String(answer);
      } else if (textLower.includes('type') || textLower.includes('category')) {
        title = `${String(answer || '')} - ${formTitle}`;
      }
    } else if (type === 'control_textarea' && answer) {
      description = String(answer);
    } else if (type === 'control_textbox') {
      if (textLower.match(/level\s*(\d)\s*approver/)) {
        const match = textLower.match(/level\s*(\d)/);
        if (match && answer) {
          const lvl = parseInt(match[1]);
          if (!levelApprovals[lvl]) levelApprovals[lvl] = { status: '', approver: '' };
          levelApprovals[lvl].approver = String(answer);
        }
      } else if ((textLower.includes('description') || textLower.includes('purchase')) && answer) {
        title = String(answer);
        description = String(answer);
      } else if (textLower.includes('amount') && answer) {
        description = `${description ? description + ' — ' : ''}AED ${Number(answer).toLocaleString()}`;
      }
    }
  }

  if (!department) department = DEPARTMENTS[Math.abs(submissionId.charCodeAt(0)) % DEPARTMENTS.length];

  const daysSinceSubmission = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));

  // Determine current approval level from actual form data
  let currentLevel: ApprovalLevel | 'completed' | 'rejected';
  const approvalHistory: { level: ApprovalLevel; approverName: string; approverNameAr?: string; status: 'approved' | 'pending' | 'rejected'; date?: string; comments?: string }[] = [];
  const hasLevelData = Object.keys(levelApprovals).length > 0;

  if (hasLevelData) {
    // Use actual approval data from form fields
    let lastApprovedLevel = 0;
    let rejected = false;

    for (let lvl = 1; lvl <= 4; lvl++) {
      const la = levelApprovals[lvl];
      if (!la) continue;
      const statusLower = la.status.toLowerCase();
      const approverName = la.approver || `Level ${lvl} Approver`;

      if (statusLower === 'approved') {
        approvalHistory.push({ level: lvl as ApprovalLevel, approverName, status: 'approved', date: createdAt.split(' ')[0] });
        lastApprovedLevel = lvl;
      } else if (statusLower === 'rejected') {
        approvalHistory.push({ level: lvl as ApprovalLevel, approverName, status: 'rejected', date: createdAt.split(' ')[0] });
        rejected = true;
        break;
      } else {
        approvalHistory.push({ level: lvl as ApprovalLevel, approverName: approverName || 'Pending Assignment', status: 'pending' });
        break;
      }
    }

    if (rejected) {
      currentLevel = 'rejected';
    } else if (lastApprovedLevel >= 4 || overallStatus.toLowerCase() === 'completed') {
      currentLevel = 'completed';
    } else {
      currentLevel = (lastApprovedLevel + 1) as ApprovalLevel;
    }
  } else {
    // Fallback: estimate from time
    const level = daysSinceSubmission < 1 ? 1 : daysSinceSubmission < 3 ? 2 : daysSinceSubmission < 5 ? 3 : 4;
    currentLevel = daysSinceSubmission > 7 ? 'completed' : level as ApprovalLevel;
    approvalHistory.push({
      level: 1 as ApprovalLevel,
      approverName: 'Auto-assigned',
      status: currentLevel === 'completed' ? 'approved' : 'pending',
      date: createdAt.split(' ')[0],
    });
  }

  // Determine overall status
  let computedStatus: 'on-track' | 'delayed' | 'critical' = 'on-track';
  if (currentLevel === 'rejected') computedStatus = 'critical';
  else if (daysSinceSubmission > 7) computedStatus = 'critical';
  else if (daysSinceSubmission > 3) computedStatus = 'delayed';

  return {
    id: submissionId,
    formId,
    formTitle,
    referenceNumber: `REF-2026-${submissionId.slice(-5)}`,
    title,
    description,
    submittedBy: { name, department, email },
    submissionDate: createdAt.split(' ')[0] || createdAt.split('T')[0],
    currentApprovalLevel: currentLevel,
    approvalHistory,
    daysAtCurrentLevel: daysSinceSubmission,
    totalDaysSinceSubmission: daysSinceSubmission,
    overallStatus: computedStatus,
    priority,
    answers: Object.fromEntries(
      Object.entries(answers)
        .filter(([, v]) => v.answer)
        .map(([k, v]) => [v.text || k, String(typeof v.answer === 'object' ? JSON.stringify(v.answer) : v.answer)])
    ),
  };
}

export function useSubmissions() {
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const config = jotformApi.getConfig();
      // Fetch real data from JotForm API
      const forms = await jotformApi.getUserForms() as Array<Record<string, unknown>>;
      const allSubs: Submission[] = [];

      for (const form of forms) {
        const formId = String(form.id);
        const formTitle = String(form.title || 'Untitled Form');
        const submissions = await jotformApi.getFormSubmissions(formId) as Array<Record<string, unknown>>;
        for (const sub of submissions) {
          allSubs.push(transformJotformSubmission(sub, formTitle, formId));
        }
      }

      setAllSubmissions(allSubs);
      setRefreshConfig(prev => ({ ...prev, lastUpdated: new Date().toISOString() }));
    } catch (err) {
      console.error('Failed to load JotForm data:', err);
      setAllSubmissions([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!refreshConfig.autoRefresh) return;
    const interval = setInterval(loadData, refreshConfig.intervalMinutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshConfig.autoRefresh, refreshConfig.intervalMinutes, loadData]);

  const filteredSubmissions = useMemo(() => {
    let result = [...allSubmissions];

    if (filters.approvalLevel) {
      const level = filters.approvalLevel === 'completed' ? 'completed' :
        filters.approvalLevel === 'rejected' ? 'rejected' :
          Number(filters.approvalLevel);
      result = result.filter(s => s.currentApprovalLevel === level);
    }
    if (filters.department) {
      result = result.filter(s => s.submittedBy.department === filters.department);
    }
    if (filters.status) {
      result = result.filter(s => s.overallStatus === filters.status);
    }
    if (filters.dateFrom) {
      result = result.filter(s => s.submissionDate >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter(s => s.submissionDate <= filters.dateTo);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.referenceNumber.toLowerCase().includes(q) ||
        s.submittedBy.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    }

    // Sort
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

  const approveSubmission = useCallback((submissionId: string, approverName: string, comments?: string) => {
    setAllSubmissions(prev => prev.map(sub => {
      if (sub.id !== submissionId) return sub;
      const currentLevel = sub.currentApprovalLevel as number;
      if (typeof currentLevel !== 'number') return sub;
      const newLevel: ApprovalLevel | 'completed' = currentLevel >= 4 ? 'completed' : ((currentLevel + 1) as ApprovalLevel);

      const updatedHistory = sub.approvalHistory.map(h =>
        h.level === currentLevel && h.status === 'pending'
          ? { ...h, status: 'approved' as const, date: new Date().toISOString().split('T')[0], comments: comments || 'Approved' }
          : h
      );

      if (typeof newLevel === 'number') {
        const nextApprover = APPROVERS[((newLevel - 1) * 2) % APPROVERS.length];
        updatedHistory.push({
          level: newLevel,
          approverName: nextApprover?.en || 'Unknown',
          approverNameAr: nextApprover?.ar,
          status: 'pending' as const,
        });
      }

      return {
        ...sub,
        currentApprovalLevel: newLevel,
        daysAtCurrentLevel: 0,
        overallStatus: 'on-track' as const,
        approvalHistory: updatedHistory,
      };
    }));
  }, []);

  const rejectSubmission = useCallback((submissionId: string, approverName: string, reason: string) => {
    setAllSubmissions(prev => prev.map(sub => {
      if (sub.id !== submissionId) return sub;
      const currentLevel = sub.currentApprovalLevel as number;
      if (typeof currentLevel !== 'number') return sub;

      return {
        ...sub,
        currentApprovalLevel: 'rejected' as const,
        daysAtCurrentLevel: 0,
        approvalHistory: sub.approvalHistory.map(h =>
          h.level === currentLevel && h.status === 'pending'
            ? { ...h, status: 'rejected' as const, date: new Date().toISOString().split('T')[0], comments: reason }
            : h
        ),
      };
    }));
  }, []);

  return {
    allSubmissions,
    setAllSubmissions,
    filteredSubmissions,
    paginatedSubmissions,
    loading,
    stats,
    approvalStats,
    departmentStats,
    trendData,
    bottleneckData,
    heatmapData,
    filters,
    setFilters,
    sort,
    setSort,
    pagination,
    setPagination,
    refreshConfig,
    setRefreshConfig,
    refresh: loadData,
    approveSubmission,
    rejectSubmission,
  };
}
