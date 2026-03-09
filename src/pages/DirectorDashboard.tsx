import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, MessageSquare, Clock, AlertTriangle, User,
  Search, ArrowUpDown, ChevronDown, ChevronUp, FileText, Loader2,
  TrendingUp, Shield, ExternalLink, ClipboardList, FileEdit, Lock,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useSubmissions } from '../hooks/useSubmissions';
import { Submission } from '../types';
import CommentPanel from '../components/CommentPanel';
import SubmissionModal from '../components/SubmissionModal';
import { getUserConfig } from '../config/currentUser';
import { useAuth } from '../contexts/AuthContext';

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
  const { user } = useAuth();
  const currentUser = getUserConfig(user?.email);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'daysAtCurrentLevel' | 'submissionDate' | 'currentApprovalLevel'>('daysAtCurrentLevel');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [taskUrlLoading, setTaskUrlLoading] = useState<string | null>(null);
  const [formUrlLoading, setFormUrlLoading] = useState<string | null>(null);
  const dismissedIds = useMemo(() => new Set([...approvedIds, ...rejectedIds]), [approvedIds, rejectedIds]);

  const openTaskUrl = async (sub: Submission) => {
    setTaskUrlLoading(sub.id);
    try {
      const res = await fetch(`/api/task-url?formId=${sub.formId}&submissionId=${sub.id}`);
      const data = await res.json();
      window.open(data.taskUrl || sub.taskUrl, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(sub.taskUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setTaskUrlLoading(null);
    }
  };

  const openFormUrl = async (sub: Submission) => {
    setFormUrlLoading(sub.id);
    try {
      const res = await fetch(`/api/form-url?formId=${sub.formId}&submissionId=${sub.id}`);
      const data = await res.json();
      window.open(data.formUrl || sub.formUrl || sub.editLink, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(sub.formUrl || sub.editLink, '_blank', 'noopener,noreferrer');
    } finally {
      setFormUrlLoading(null);
    }
  };

  // Filter to only submissions pending the director's approval
  const directorSubmissions = useMemo(() => {
    let subs = data.allSubmissions.filter(s => {
      if (dismissedIds.has(s.id)) return false;
      if (typeof s.currentApprovalLevel !== 'number') return false;

      // Check if submission is at the director's approval level
      // Admin sees everything
      if (currentUser.isAdmin) return true;

      const atDirectorLevel = currentUser.approvalLevels.includes(s.currentApprovalLevel as number);

      const pendingEntry = s.approvalHistory.find(a => a.status === 'pending');
      const nameMatch = pendingEntry && currentUser.nameMatches.length > 0
        ? currentUser.nameMatches.some(m => pendingEntry.approverName.toLowerCase().includes(m))
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
  const approvedToday = approvedIds.size;

  const LEVEL_FIELD_MAP: Record<number, { statusField: string; approverField: string; dateField: string }> = {
    1: { statusField: 'submission[8]',  approverField: 'submission[9]',  dateField: 'submission[10]' },
    2: { statusField: 'submission[11]', approverField: 'submission[12]', dateField: 'submission[13]' },
    3: { statusField: 'submission[14]', approverField: 'submission[15]', dateField: 'submission[16]' },
    4: { statusField: 'submission[17]', approverField: 'submission[18]', dateField: 'submission[19]' },
  };

  const pushToJotForm = async (sub: Submission, decision: 'approved' | 'rejected', reason?: string) => {
    if (typeof sub.currentApprovalLevel !== 'number') return;
    const lvl = sub.currentApprovalLevel;
    const fields = LEVEL_FIELD_MAP[lvl];
    if (!fields) throw new Error(`No field map for level ${lvl}`);
    const today = new Date();
    const dateStr = `${today.getMonth() + 1}-${String(today.getDate()).padStart(2, '0')}-${today.getFullYear()}`;
    const params = new URLSearchParams();
    params.set(fields.statusField, decision === 'approved' ? 'Approved' : 'Rejected');
    params.set(fields.approverField, reason ? `${currentUser.name}: ${reason}` : currentUser.name);
    params.set(fields.dateField, dateStr);
    params.set('submission[20]', decision === 'rejected' ? 'Rejected' : lvl === 4 ? 'Completed' : 'In Progress');
    const res = await fetch(`/api/jotform-update?submissionId=${sub.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
  };

  const handleReject = async (sub: Submission) => {
    if (!rejectReason.trim()) return;
    setActionLoading(sub.id);
    try {
      await pushToJotForm(sub, 'rejected', rejectReason.trim());
      addAuditEntry(sub.id, 'rejected', currentUser.name, `Rejected: ${rejectReason.trim()}`);
      setRejectReason('');
      setRejectingId(null);
      setRejectedIds(prev => new Set([...prev, sub.id]));
      data.refresh();
    } catch (err) {
      alert(`Rejection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(null);
    }
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
              Welcome, {currentUser.name} — <span className="text-gold capitalize">{currentUser.role}</span>
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
                        className="text-sm font-mono text-gold hover:underline block"
                      >
                        {sub.referenceNumber.split('-').pop()}
                      </button>
                      <a
                        href={`https://eforms.mediaoffice.ae/inbox/${sub.formId}/${sub.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-gray-600 hover:text-gold flex items-center gap-0.5 mt-0.5"
                      >
                        <ExternalLink className="w-2.5 h-2.5" /> View in JotForm
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://eforms.mediaoffice.ae/inbox/${sub.formId}/${sub.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-white hover:text-gold hover:underline inline-flex items-center gap-1 group"
                      >
                        {sub.title}
                        <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-gold transition-colors" />
                      </a>
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
                      <div className="flex flex-col gap-1">
                        {/* ── Primary: Review + Reject + Comment ── */}
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Only show Approve if user is authorized for this level */}
                          {typeof sub.currentApprovalLevel === 'number' && (currentUser.isAdmin || currentUser.approvalLevels.includes(sub.currentApprovalLevel)) ? (
                            <button
                              onClick={() => setSelectedSubmission(sub)}
                              disabled={actionLoading === sub.id}
                              className="px-2.5 py-1.5 rounded-lg bg-gold/20 text-gold hover:bg-gold/30 disabled:opacity-50 text-xs font-medium flex items-center gap-1 transition-colors"
                              title={[3,4].includes(sub.currentApprovalLevel) ? 'Review, sign & approve' : 'Review & approve'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {[3,4].includes(sub.currentApprovalLevel) ? 'Review & Sign' : 'Review & Approve'}
                            </button>
                          ) : typeof sub.currentApprovalLevel === 'number' ? (
                            <span className="px-2.5 py-1.5 rounded-lg bg-gray-500/10 text-gray-600 text-xs font-medium flex items-center gap-1 border border-gray-500/10" title={`Your role cannot approve Level ${sub.currentApprovalLevel}`}>
                              <Lock className="w-3.5 h-3.5" /> Not your level
                            </span>
                          ) : null}

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
                              <button
                                onClick={() => handleReject(sub)}
                                disabled={!rejectReason.trim() || actionLoading === sub.id}
                                className="px-2 py-1 rounded bg-red-500/30 text-red-400 text-xs hover:bg-red-500/40 disabled:opacity-50 flex items-center gap-1"
                              >
                                {actionLoading === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
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
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          )}

                          <button
                            onClick={() => setCommentingId(commentingId === sub.id ? null : sub.id)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 border transition-colors ${
                              commentingId === sub.id
                                ? 'bg-blue-500/30 text-blue-300 border-blue-500/30'
                                : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-blue-500/20'
                            }`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" /> Comment
                          </button>
                        </div>

                        {/* ── Secondary: View Task / View Form reference links ── */}
                        <div className="flex items-center justify-center gap-3">
                          {sub.taskUrl && (
                            <button
                              onClick={() => openTaskUrl(sub)}
                              disabled={taskUrlLoading === sub.id}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-gold transition-colors disabled:opacity-50"
                              title="Open task in JotForm"
                            >
                              {taskUrlLoading === sub.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <ClipboardList className="w-3 h-3" />
                              }
                              {taskUrlLoading === sub.id ? 'Loading...' : 'View Task'}
                            </button>
                          )}
                          {(sub.formUrl || sub.editLink) && (
                            <button
                              onClick={() => openFormUrl(sub)}
                              disabled={formUrlLoading === sub.id}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-50"
                              title="Open form in JotForm"
                            >
                              {formUrlLoading === sub.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <FileEdit className="w-3 h-3" />
                              }
                              {formUrlLoading === sub.id ? 'Loading...' : 'View Form'}
                            </button>
                          )}
                        </div>
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
          onUpdate={() => { setSelectedSubmission(null); data.refresh(); }}
        />
      )}
    </div>
  );
}
