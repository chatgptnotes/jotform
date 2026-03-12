import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle2, Clock, XCircle, User, Calendar, Building2, FileText,
  Send, Loader2, AlertCircle, ClipboardList, FileEdit, ExternalLink,
} from 'lucide-react';
import { Submission } from '../types';
import jotformApi from '../services/jotformApi';
import { getUserConfig } from '../config/currentUser';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  submission: Submission | null;
  onClose: () => void;
  /** Called after a successful approve/reject. Passes submissionId, new level, and new status string so parent can optimistically update. */
  onUpdate?: (submissionId?: string, newLevel?: import('../types').ApprovalLevel | 'completed' | 'rejected', newJotformStatus?: string) => void;
}

const levelColors: Record<string, string> = {
  '1': 'bg-blue-500',
  '2': 'bg-amber-500',
  '3': 'bg-purple-500',
  '4': 'bg-red-500',
  'completed': 'bg-emerald-500',
  'rejected': 'bg-gray-500',
};

// Form-specific field maps for approval actions.
// Purchase Order form (260562405560351) has 4 approval levels, each with their own status + approver fields.
// Content Publishing form (260562114142344) has a single approvalStatus field at id 10.
// Other forms are not supported for direct approval from JotFlow.

const PO_FORM_ID = '260562405560351';
const CP_FORM_ID = '260562114142344';

type FieldMap = { statusField: string; approverField: string | null; overallStatusField: string | null };

function getFieldMap(submission: Submission, level: number): FieldMap | null {
  const formId = submission.formId;
  if (formId === PO_FORM_ID) {
    const po: Record<number, { statusField: string; approverField: string }> = {
      1: { statusField: '8',  approverField: '9'  },
      2: { statusField: '11', approverField: '12' },
      3: { statusField: '14', approverField: '15' },
      4: { statusField: '17', approverField: '18' },
    };
    const m = po[level];
    return m ? { ...m, overallStatusField: '20' } : null;
  }
  if (formId === CP_FORM_ID && level === 1) {
    return { statusField: '10', approverField: null, overallStatusField: null };
  }
  // Dynamic form: use levelFieldMap populated by the generic mapper
  if (submission.levelFieldMap) {
    const lf = submission.levelFieldMap.find(m => m.level === level);
    if (lf) return { statusField: lf.statusFieldId, approverField: lf.approverFieldId, overallStatusField: lf.overallStatusFieldId };
  }
  return null; // no field map available
}

export default function SubmissionModal({ submission, onClose, onUpdate }: Props) {
  const { user } = useAuth();
  const currentUser = getUserConfig(user?.email);

  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);
  const [comment, setComment] = useState('');
  // Two-click confirmation: 'approve' | 'reject' | null
  const [confirmPending, setConfirmPending] = useState<'approve' | 'reject' | null>(null);

  const isSubmitting = approving || rejecting;

  // Comment is optional — buttons always enabled while not submitting
  const canAct = !isSubmitting;

  const handleApproval = async (action: 'approve' | 'reject') => {
    if (!submission || typeof submission.currentApprovalLevel !== 'number') return;

    action === 'approve' ? setApproving(true) : setRejecting(true);
    setPushResult(null);

    const lvl = submission.currentApprovalLevel;
    const fields = getFieldMap(submission, lvl);
    if (!fields) {
      setPushResult({ success: false, message: `Direct approval is not supported for this form (${submission.formId}). Please action it in JotForm directly.` });
      setApproving(false);
      setRejecting(false);
      return;
    }

    const actionLabel = action === 'approve' ? 'Approved' : 'Rejected';
    const timestamp = new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai', hour12: true });

    // Build approver note (comment is optional)
    const noteParts = [
      `Action: ${actionLabel}`,
      `By: ${currentUser.name} (${user?.email || 'unknown'})`,
      `Via: JotFlow`,
      `Date: ${timestamp}`,
      ...(comment.trim() ? [`Comment: ${comment.trim()}`] : []),
    ];
    const approverNote = noteParts.join(' | ');

    const updates: Record<string, string> = {
      [fields.statusField]: actionLabel,
    };
    // Only set the approver note if this form has a separate approver field
    if (fields.approverField && fields.approverField !== fields.statusField) {
      updates[fields.approverField] = approverNote;
    }
    // Only update the overall status field if this form has one
    if (fields.overallStatusField) {
      if (action === 'reject') updates[fields.overallStatusField] = 'Rejected';
      else if (lvl === 4) updates[fields.overallStatusField] = 'Completed';
      else updates[fields.overallStatusField] = 'In Progress';
    }

    const result = await jotformApi.updateSubmission(submission.id, updates, {
      _action: action,
      _level: String(lvl),
      _signatureUrl: '',
    });
    setPushResult(result);
    setApproving(false);
    setRejecting(false);

    if (result.success && onUpdate) {
      // Compute new level/status for optimistic update in parent
      let newLevel: import('../types').ApprovalLevel | 'completed' | 'rejected' | undefined;
      let newJotformStatus: string | undefined;
      if (action === 'reject') {
        newLevel = 'rejected';
        newJotformStatus = 'Rejected';
      } else {
        newLevel = lvl === 4 ? 'completed' : (lvl + 1) as import('../types').ApprovalLevel;
        newJotformStatus = lvl === 4 ? 'Completed' : 'In Progress';
      }
      setTimeout(() => onUpdate(submission.id, newLevel, newJotformStatus), 1200);
    }
  };

  const openTaskUrl = () => {
    if (!submission?.taskUrl) return;
    // Link to main form's inbox for this submission — the native JotForm
    // "View Task" button on that page leads to the actual task completion URL.
    // (JotForm does not expose the approval-form task URL via API.)
    window.open(submission.taskUrl, '_blank', 'noopener,noreferrer');
  };

  const openFormUrl = () => {
    if (!submission?.formUrl) return;
    // Link to main form's inbox for this submission — the native JotForm
    // "View This Form" button on that page leads to the actual form-fill URL.
    // (JotForm does not expose the internal form-fill URL per-submission via API.)
    window.open(submission.formUrl, '_blank', 'noopener,noreferrer');
  };

  // Reset form when submission changes; cancel any in-flight request
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setComment('');
    setPushResult(null);
    setApproving(false);
    setRejecting(false);
    setConfirmPending(null);
  }, [submission?.id]);

  // Keyboard: Esc to close — blocked while submission is in progress
  useEffect(() => {
    if (!submission) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [submission, onClose, isSubmitting]);

  if (!submission) return null;

  const levelLabel = typeof submission.currentApprovalLevel === 'number'
    ? `Level ${submission.currentApprovalLevel}`
    : submission.currentApprovalLevel;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={isSubmitting ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="p-6 border-b border-navy-light/20 flex items-start justify-between sticky top-0 bg-navy-dark/95 z-10">
            <div>
              <p className="text-xs text-gold font-medium">{submission.referenceNumber}</p>
              <h3 className="text-xl font-bold text-white mt-1">{submission.title}</h3>
              <p className="text-sm text-gray-400 mt-1">{submission.formTitle}</p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-lg hover:bg-navy-light/30 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              title={isSubmitting ? 'Please wait until submission completes' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Details */}
          <div className="p-6 space-y-6">
            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Submitted By</p>
                  <p className="text-sm text-white">{submission.submittedBy.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Department</p>
                  <p className="text-sm text-white">{submission.submittedBy.department}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Submitted</p>
                  <p className="text-sm text-white">{submission.submissionDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-500">Form ID</p>
                  <p className="text-sm text-white">{submission.formId}</p>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${levelColors[String(submission.currentApprovalLevel)]}`}>
                {levelLabel}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold status-${submission.overallStatus}`}>
                {submission.overallStatus}
              </span>
              <span className="text-xs text-gray-500">{submission.totalDaysSinceSubmission} days total</span>
            </div>

            {/* Action section */}
            {typeof submission.currentApprovalLevel === 'number' && (
              <div className="bg-navy-light/30 rounded-xl p-4 border border-navy-light/20 space-y-4">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Send className="w-4 h-4 text-gold" />
                  {submission.actionType === 'task' ? 'Task Action' :
                   submission.actionType === 'form' ? 'Complete Form' :
                   `Take Action — Level ${submission.currentApprovalLevel}`}
                  <span className="text-xs text-gray-500 font-normal ml-2">
                    {submission.actionType === 'approval' ? '(Pushes to JotForm Enterprise)' : '(Opens in JotForm)'}
                  </span>
                </h4>

                {/* ── TASK step ── */}
                {submission.actionType === 'task' && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-400">
                      This step requires completing a task in JotForm. Click below to open your assigned task directly.
                    </p>
                    <button
                      onClick={openTaskUrl}
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gold/20 hover:bg-gold/30 text-gold rounded-xl font-semibold text-sm border border-gold/20 transition-all"
                    >
                      <ClipboardList className="w-4 h-4" />
                      View Task in JotForm
                      <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </div>
                )}

                {/* ── FORM step ── */}
                {submission.actionType === 'form' && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-400">
                      This step requires filling out or completing a form in JotForm. Click below to open it.
                    </p>
                    <button
                      onClick={openFormUrl}
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl font-semibold text-sm border border-blue-500/20 transition-all"
                    >
                      <FileEdit className="w-4 h-4" />
                      Complete Form in JotForm
                      <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </div>
                )}

                {/* ── APPROVAL step ── */}
                {submission.actionType === 'approval' && (<>

                {/* Optional comment */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    Comment <span className="text-gray-600 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Add a note for this decision (optional)..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-navy-dark border border-navy-light/30 focus:border-gold/50 text-sm text-white placeholder-gray-600 focus:outline-none resize-none transition-colors"
                  />
                </div>

                {/* Approve / Reject — two-click confirmation */}
                {confirmPending ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                    <p className="text-xs text-amber-400 font-medium text-center">
                      Confirm {confirmPending === 'approve' ? 'Approval' : 'Rejection'} — this cannot be undone
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setConfirmPending(null); handleApproval(confirmPending); }}
                        disabled={isSubmitting}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 ${
                          confirmPending === 'approve'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-red-600 hover:bg-red-500 text-white'
                        }`}
                      >
                        {isSubmitting
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : confirmPending === 'approve' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {isSubmitting ? 'Submitting...' : `Yes, ${confirmPending === 'approve' ? 'Approve' : 'Reject'}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPending(null)}
                        disabled={isSubmitting}
                        className="px-4 py-2.5 rounded-xl font-semibold text-sm bg-navy-light/30 text-gray-400 hover:text-white transition-all disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmPending('approve')}
                      disabled={!canAct}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPending('reject')}
                      disabled={!canAct}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}

                {pushResult && (
                  <div className={`p-3 rounded-lg text-sm font-medium ${
                    pushResult.success
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {pushResult.success ? '✅ Successfully pushed to JotForm!' : `❌ ${pushResult.message}`}
                  </div>
                )}
                </>)}
              </div>
            )}

            {/* Approval Timeline */}
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Approval Timeline</h4>
              <div className="space-y-0">
                {submission.approvalHistory.map((entry, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        entry.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' :
                        entry.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {entry.status === 'approved' ? <CheckCircle2 className="w-4 h-4" /> :
                         entry.status === 'rejected' ? <XCircle className="w-4 h-4" /> :
                         <Clock className="w-4 h-4" />}
                      </div>
                      {i < submission.approvalHistory.length - 1 && (
                        <div className="w-px h-10 bg-navy-light/30" />
                      )}
                    </div>
                    <div className="pb-6">
                      <p className="text-sm font-medium text-white">Level {entry.level} — {entry.approverName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.status === 'pending' ? 'Pending approval' : `${entry.status} on ${entry.date}`}
                      </p>
                      {entry.comments && <p className="text-xs text-gray-400 mt-1 italic">"{entry.comments}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

      </motion.div>
    </AnimatePresence>
  );
}
