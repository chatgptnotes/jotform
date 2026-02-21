import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown, Download, Filter, X } from 'lucide-react';
import { Submission } from '../types';
import SubmissionModal from '../components/SubmissionModal';
import { exportToExcel } from '../services/exportService';

interface Props {
  data: ReturnType<typeof import('../hooks/useSubmissions').useSubmissions>;
}

const DEPARTMENTS = ['Finance', 'HR', 'Procurement', 'IT', 'Operations', 'Legal', 'Admin', 'Marketing'];
const LEVELS = [
  { value: '', label: 'All Levels' },
  { value: '1', label: 'Level 1' },
  { value: '2', label: 'Level 2' },
  { value: '3', label: 'Level 3' },
  { value: '4', label: 'Level 4' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
];
const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'on-track', label: 'On Track' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'critical', label: 'Critical' },
];

const levelColors: Record<string, string> = {
  '1': 'bg-blue-500/20 text-blue-400',
  '2': 'bg-amber-500/20 text-amber-400',
  '3': 'bg-purple-500/20 text-purple-400',
  '4': 'bg-red-500/20 text-red-400',
  'completed': 'bg-emerald-500/20 text-emerald-400',
  'rejected': 'bg-gray-500/20 text-gray-400',
};

export default function WorkflowTracker({ data }: Props) {
  const { paginatedSubmissions, filteredSubmissions, filters, setFilters, sort, setSort, pagination, setPagination } = data;
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (key: string) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sort.key !== column) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-600" />;
    return sort.direction === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-gold" /> : <ChevronDown className="w-3.5 h-3.5 text-gold" />;
  };

  const hasActiveFilters = filters.approvalLevel || filters.department || filters.status || filters.dateFrom || filters.dateTo;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by title, reference, or name..."
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="w-full pl-10 pr-4 py-2.5 bg-navy border border-navy-light/30 rounded-xl text-sm text-white placeholder-gray-500 focus:border-gold/50 focus:outline-none"
          />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`btn-outline flex items-center gap-2 ${hasActiveFilters ? 'border-gold/50 text-gold' : ''}`}>
          <Filter className="w-4 h-4" />
          Filters
          {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-gold" />}
        </button>
        <button onClick={() => exportToExcel(filteredSubmissions)} className="btn-gold flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export Excel
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-300">Filters</h4>
            <button onClick={() => setFilters({ approvalLevel: '', department: '', status: '', dateFrom: '', dateTo: '', search: filters.search })} className="text-xs text-gold hover:underline">Clear All</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <select value={filters.approvalLevel} onChange={e => setFilters(prev => ({ ...prev, approvalLevel: e.target.value }))} className="bg-navy-dark border border-navy-light/30 rounded-lg px-3 py-2 text-sm text-gray-300">
              {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <select value={filters.department} onChange={e => setFilters(prev => ({ ...prev, department: e.target.value }))} className="bg-navy-dark border border-navy-light/30 rounded-lg px-3 py-2 text-sm text-gray-300">
              <option value="">All Departments</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} className="bg-navy-dark border border-navy-light/30 rounded-lg px-3 py-2 text-sm text-gray-300">
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))} className="bg-navy-dark border border-navy-light/30 rounded-lg px-3 py-2 text-sm text-gray-300" placeholder="From" />
            <input type="date" value={filters.dateTo} onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))} className="bg-navy-dark border border-navy-light/30 rounded-lg px-3 py-2 text-sm text-gray-300" placeholder="To" />
          </div>
        </motion.div>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{filteredSubmissions.length.toLocaleString()} submissions found</p>
        <select
          value={pagination.perPage}
          onChange={e => setPagination(prev => ({ ...prev, perPage: Number(e.target.value), page: 1 }))}
          className="bg-navy border border-navy-light/30 rounded-lg px-3 py-1.5 text-xs text-gray-400"
        >
          <option value={25}>25 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-navy-light/20">
                {[
                  { key: 'referenceNumber', label: 'Reference' },
                  { key: 'title', label: 'Title' },
                  { key: 'submittedBy', label: 'Submitted By' },
                  { key: 'submissionDate', label: 'Date' },
                  { key: 'currentApprovalLevel', label: 'Level' },
                  { key: 'daysAtCurrentLevel', label: 'Days at Level' },
                  { key: 'totalDaysSinceSubmission', label: 'Total Days' },
                  { key: 'overallStatus', label: 'Status' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gold transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      <SortIcon column={col.key} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedSubmissions.map((sub, i) => (
                <motion.tr
                  key={sub.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => setSelectedSubmission(sub)}
                  className="border-b border-navy-light/10 hover:bg-navy-light/20 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-mono text-gold">{sub.referenceNumber}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-white truncate max-w-[200px]">{sub.title}</p>
                    <p className="text-xs text-gray-500">{sub.formTitle}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-white">{sub.submittedBy.name}</p>
                    <p className="text-xs text-gray-500">{sub.submittedBy.department}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{sub.submissionDate}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${levelColors[String(sub.currentApprovalLevel)]}`}>
                      {typeof sub.currentApprovalLevel === 'number' ? `Level ${sub.currentApprovalLevel}` : sub.currentApprovalLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{sub.daysAtCurrentLevel}d</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{sub.totalDaysSinceSubmission}d</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold status-${sub.overallStatus}`}>
                      {sub.overallStatus}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-navy-light/20">
          <p className="text-xs text-gray-500">
            Showing {((pagination.page - 1) * pagination.perPage) + 1}–{Math.min(pagination.page * pagination.perPage, filteredSubmissions.length)} of {filteredSubmissions.length}
          </p>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(Math.ceil(filteredSubmissions.length / pagination.perPage), 7) }, (_, i) => (
              <button
                key={i}
                onClick={() => setPagination(prev => ({ ...prev, page: i + 1 }))}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  pagination.page === i + 1
                    ? 'bg-gold text-navy-dark'
                    : 'text-gray-400 hover:bg-navy-light/30'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SubmissionModal submission={selectedSubmission} onClose={() => setSelectedSubmission(null)} />
    </div>
  );
}
