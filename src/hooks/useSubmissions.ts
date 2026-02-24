import { useState, useEffect, useCallback, useMemo } from 'react';
import { Submission, ApprovalLevel, FilterConfig, SortConfig, PaginationConfig, RefreshConfig } from '../types';
import { generateMockSubmissions, getDashboardStats, getApprovalLevelStats, getDepartmentStats, getTrendData, getBottleneckData, getHeatmapData, APPROVERS } from '../services/mockData';

const STORAGE_KEY = 'jotform_submissions_cache';

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

  const loadData = useCallback(() => {
    setLoading(true);
    // In production, this would call jotformApi
    const data = generateMockSubmissions(500);
    setAllSubmissions(data);
    setRefreshConfig(prev => ({ ...prev, lastUpdated: new Date().toISOString() }));
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
