import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, MessageSquare, Clock, AlertTriangle, User,
  Search, ArrowUpDown, ChevronDown, ChevronUp, FileText, Loader2,
  TrendingUp, Shield,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useSubmissions } from '../hooks/useSubmissions';
import { Submission } from '../types';
import CommentPanel from '../components/CommentPanel';
import SubmissionModal from '../components/SubmissionModal';
import { CURRENT_USER } from '../config/currentUser';

interface Props {
  data: ReturnType<typeof useSubmissions>;
}

function AgingCell({ days }: { days: number }) {
  const color = days > 14 ? 'text-red-400' : days > 7 ? 'text-orange-400' : days > 3 ? 'text-amber-400' : 'text-emerald-400';
  const barColor = days > 14 ? 'bg-red-500' : days > 7 ? 'bg-orange-500' : days > 3 ? 'bg-amber-500' : 'bg-emerald-500';
  const barWidth = Math.min(100, (days / 30) * 100);
  return (
    <div className="space-y-1">
      <span className={`text-sm font-bold ${color} ${days > 14 ? 'animate-pulse' : ''}`}>{days}d</span>
      <div className="h-1 w-16 rounded-full bg-navy-light/30 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  );
}

function PendingWithCell({ submission }: { submission: Submission }) {
  const pendingEntry = submission.approvalHistory.find(a => a.status === 'pending');
  if (!pendingEntry) return <span className="text-gray-600">--</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
        <User className="w-3.5 h-3.5 text-purple-400" />
      </div>
      <div>
        <p className="text-sm text-white leading-tight">{pendingEntry.approverName}</p>
        <p className="text-xs text-gray-500">Level {pendingEntry.level}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'on-track': 'bg-emerald-500/20 text-emerald-400',
    'delayed': 'bg-amber-500/20 text-amber-400',
    'critical': 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-500/20 text-gray-400'}`}>
      {status}
    </span>
  );
}

function LevelBadge({ level }: { level: number }) {
  const colors: Record<number, string> = {
    1: 'bg-blue-500/20 text-blue-400',
    2: 'bg-amber-500/20 text-amber-400',
    3: 'bg-purple-500/20 text-purple-400',
    4: 'bg-red-500/20 text-red-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[level] || 'bg-gray-500/20 text-gray-400'}`}>
      L{level}
    </span>
  );
}

export default function DirectorDashboard({ data }: Props) {
  const { activeSidebarCategory, addAuditEntry } = useApp();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'daysAtCurrentLevel' | 'submissionDate' | 'currentApprovalLevel'>('daysAtCurrentLevel');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Filter to only submissions pending the director's approval
  const directorSubmissions = useMemo(() => {
    let subs = data.allSubmissions.filter(s => {
      if (dismissedIds.has(s.id)) return false;
      if (typeof s.currentApprovalLevel !== 'number') return false;

      // Check if submission is at the director's approval level
      const atDirectorLevel = CURRENT_USER.approvalLevels.includes(s.currentApprovalLevel as number);

      // Check if the pending approver name matches the director
      const pendingEntry = s.approvalHistory.find(a => a.status === 'pending');
      const nameMatch = pendingEntry
        ? CURRENT_USER.nameMatches.some(m => pendingEntry.approverName.toLowerCase().includes(m))
        : false;

      return atDirectorLevel || nameMatch;
    });

    // Apply sidebar category filter
    if (activeSidebarCategory?.filter?.departments?.length) {
      subs = subs.filter(s => activeSidebarCategory.filter!.departments!.includes(s.submittedBy.department));
    }
    if (activeSidebarCategory?.filter?.formIds?.length) {
      subs = subs.filter(s => activeSidebarCategory.filter!.formIds!.includes(s.formId));
    }

    // Apply search
    if (search) {
      const q = search.toLowerCase();
      subs = subs.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.referenceNumber.toLowerCase().includes(q) ||
        s.submittedBy.name.toLowerCase().includes(q) ||
        s.formTitle.toLowerCase().includes(q)
      );
    }

    // Sort
    subs.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'daysAtCurrentLevel') cmp = a.daysAtCurrentLevel - b.daysAtCurrentLevel;
      else if (sortKey === 'submissionDate') cmp = a.submissionDate.localeCompare(b.submissionDate);
      else if (sortKey === 'currentApprovalLevel') cmp = Number(a.currentApprovalLevel) - Number(b.currentApprovalLevel);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return subs;
  }, [data.allSubmissions, activeSidebarCategory, search, sortKey, sortDir, dismissedIds]);

  // Stats
  const pendingCount = directorSubmissions.length;
  const criticalCount = directorSubmissions.filter(s => s.daysAtCurrentLevel > 7).length;
  const avgWait = pendingCount > 0
    ? Math.round(directorSubmissions.reduce((sum, s) => sum + s.daysAtCurrentLevel, 0) / pendingCount)
    : 0;
  const approvedToday = dismissedIds.size;

  const handleApprove = (sub: Submission) => {
    data.approveSubmission(sub.id, 'Director', 'Approved');
    addAuditEntry(sub.id, 'approved', 'Director', `Approved at Level ${sub.currentApprovalLevel}`);
    setDismissedIds(prev => new Set([...prev, sub.id]));
  };

  const handleReject = (sub: Submission) => {
    if (!rejectReason.trim()) return;
    data.rejectSubmission(sub.id, 'Director', rejectReason.trim());
    addAuditEntry(sub.id, 'rejected', 'Director', `Rejected: ${rejectReason.trim()}`);
    setRejectReason('');
    setRejectingId(null);
    setDismissedIds(prev => new Set([...prev, sub.id]));
  };

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortKey }) => (
    sortKey === field
      ? (sortDir === 'desc' ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />)
      : <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />
  );

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 border border-gold/20 bg-gradient-to-r from-gold/5 to-transparent"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Welcome, {CURRENT_USER.name} — <span className="text-gold capitalize">{CURRENT_USER.role}</span>
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {directorSubmissions.length > 0
                ? `Showing ${directorSubmissions.length} form${directorSubmissions.length !== 1 ? 's' : ''} pending your approval`
                : 'No forms pending your approval — all caught up!'}
            </p>
            {activeSidebarCategory?.label && activeSidebarCategory.id !== 'all' && (
              <p className="text-xs text-gray-500 mt-0.5">Filter: {activeSidebarCategory.label}</p>
            )}
          </div>
          <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center">
            <User className="w-6 h-6 text-gold" />
          </div>
        </div>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending Approvals', value: pendingCount, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Approved Today', value: approvedToday, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Avg Wait (days)', value: avgWait, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Critical (>7d)', value: criticalCount, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by reference, title, submitter, or form type..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-navy-dark border border-navy-light/30 text-sm text-white placeholder-gray-600 focus:border-gold/50 focus:outline-none"
          />
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="glass-card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-navy-light/20">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title / Form</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted By</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none" onClick={() => toggleSort('currentApprovalLevel')}>
                  <div className="flex items-center gap-1">Level <SortIcon field="currentApprovalLevel" /></div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pending With</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none" onClick={() => toggleSort('daysAtCurrentLevel')}>
                  <div className="flex items-center gap-1">Aging <SortIcon field="daysAtCurrentLevel" /></div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {directorSubmissions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Shield className="w-10 h-10 text-emerald-400/50" />
                        <p className="text-gray-400">No pending approvals</p>
                        <p className="text-xs text-gray-600">All caught up!</p>
                      </div>
                    </td>
                  </tr>
                )}
                {directorSubmissions.map((sub) => (
                  <motion.tr
                    key={sub.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-b border-navy-light/10 hover:bg-navy-light/5"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedSubmission(sub)}
                        className="text-sm font-mono text-gold hover:underline"
                      >
                        {sub.referenceNumber.split('-').pop()}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-white">{sub.title}</p>
                      <p className="text-xs text-gray-500">{sub.formTitle}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-300">{sub.submittedBy.name}</p>
                      <p className="text-xs text-gray-500">{sub.submittedBy.department}</p>
                    </td>
                    <td className="px-4 py-3">
                      <LevelBadge level={sub.currentApprovalLevel as number} />
                    </td>
                    <td className="px-4 py-3">
                      <PendingWithCell submission={sub} />
                    </td>
                    <td className="px-4 py-3">
                      <AgingCell days={sub.daysAtCurrentLevel} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sub.overallStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Approve */}
                        <button
                          onClick={() => handleApprove(sub)}
                          className="px-2.5 py-1.5 rounded-lg bg-gold/20 text-gold hover:bg-gold/30 text-xs font-medium flex items-center gap-1 transition-colors"
                          title="Link for Approval"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>

                        {/* Reject */}
                        {rejectingId === sub.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleReject(sub)}
                              placeholder="Reason..."
                              autoFocus
                              className="w-28 px-2 py-1 text-xs rounded bg-navy-dark border border-red-500/30 text-white placeholder-gray-600 focus:outline-none"
                            />
                            <button onClick={() => handleReject(sub)} className="px-2 py-1 rounded bg-red-500/30 text-red-400 text-xs hover:bg-red-500/40">
                              OK
                            </button>
                            <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="px-1.5 py-1 text-xs text-gray-500 hover:text-gray-300">
                              X
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRejectingId(sub.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium flex items-center gap-1 border border-red-500/20 transition-colors"
                            title="Reject and Close"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        )}

                        {/* Comment */}
                        <button
                          onClick={() => setCommentingId(commentingId === sub.id ? null : sub.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 border transition-colors ${
                            commentingId === sub.id
                              ? 'bg-blue-500/30 text-blue-300 border-blue-500/30'
                              : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-blue-500/20'
                          }`}
                          title="Require Comments"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Comment
                        </button>
                      </div>

                      {/* Inline Comment Panel */}
                      <AnimatePresence>
                        {commentingId === sub.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2"
                          >
                            <CommentPanel
                              submissionId={sub.id}
                              onClose={() => setCommentingId(null)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-navy-light/20 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Showing {directorSubmissions.length} pending approval{directorSubmissions.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <TrendingUp className="w-3.5 h-3.5" />
            Sort: {sortKey === 'daysAtCurrentLevel' ? 'Aging' : sortKey === 'submissionDate' ? 'Date' : 'Level'} ({sortDir})
          </div>
        </div>
      </motion.div>

      {/* Submission Detail Modal */}
      {selectedSubmission && (
        <SubmissionModal
          submission={selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
        />
      )}
    </div>
  );
}
