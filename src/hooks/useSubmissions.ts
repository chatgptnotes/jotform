import { useState, useEffect, useCallback, useMemo } from 'react';
import { Submission, FilterConfig, SortConfig, PaginationConfig, RefreshConfig } from '../types';
import { generateMockSubmissions, getDashboardStats, getApprovalLevelStats, getDepartmentStats, getTrendData, getBottleneckData, getHeatmapData } from '../services/mockData';

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
    // Director view: only show submissions pending Director Huzaifa Dawasaz's approval (Level 1)
    const data = generateMockSubmissions(500);
    const directorPending = data.filter(s => s.currentApprovalLevel === 1);
    setAllSubmissions(directorPending);
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

  return {
    allSubmissions,
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
  };
}
