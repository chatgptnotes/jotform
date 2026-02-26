import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Clock, XCircle, User, Calendar, Building2, FileText, Send, Loader2 } from 'lucide-react';
import { Submission } from '../types';
import jotformApi from '../services/jotformApi';

interface Props {
  submission: Submission | null;
  onClose: () => void;
  onUpdate?: () => void;
}

const levelColors: Record<string, string> = {
  '1': 'bg-blue-500',
  '2': 'bg-amber-500',
  '3': 'bg-purple-500',
  '4': 'bg-red-500',
  'completed': 'bg-emerald-500',
  'rejected': 'bg-gray-500',
};

// Map approval level numbers to JotForm question IDs for the Purchase Order form
const LEVEL_FIELD_MAP: Record<number, { statusField: string; approverField: string }> = {
  1: { statusField: '8', approverField: '9' },
  2: { statusField: '11', approverField: '12' },
  3: { statusField: '14', approverField: '15' },
  4: { statusField: '17', approverField: '18' },
};

export default function SubmissionModal({ submission, onClose, onUpdate }: Props) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleApproval = async (action: 'approve' | 'reject') => {
    if (!submission || typeof submission.currentApprovalLevel !== 'number') return;
    
    action === 'approve' ? setApproving(true) : setRejecting(true);
    setPushResult(null);

    const level = submission.currentApprovalLevel;
    const fields = LEVEL_FIELD_MAP[level];
    if (!fields) {
      setPushResult({ success: false, message: `No field mapping for level ${level}` });
      setApproving(false);
      setRejecting(false);
      return;
    }

    const updates: Record<string, string> = {
      [fields.statusField]: action === 'approve' ? 'Approved' : 'Rejected',
      [fields.approverField]: `${action === 'approve' ? 'Approved' : 'Rejected'} via JotFlow Dashboard`,
    };

    // If approving last level or rejecting, update overall status
    if (action === 'reject') {
      updates['20'] = 'Rejected';
    } else if (level === 4) {
      updates['20'] = 'Completed';
    } else {
      updates['20'] = 'In Progress';
    }

    const result = await jotformApi.updateSubmission(submission.id, updates);
    setPushResult(result);
    setApproving(false);
    setRejecting(false);

    if (result.success && onUpdate) {
      setTimeout(() => onUpdate(), 1500);
    }
  };

  // Keyboard: Esc to close
  useEffect(() => {
    if (!submission) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [submission, onClose]);

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
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="glass-card w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="p-6 border-b border-navy-light/20 flex items-start justify-between">
            <div>
              <p className="text-xs text-gold font-medium">{submission.referenceNumber}</p>
              <h3 className="text-xl font-bold text-white mt-1">{submission.title}</h3>
              <p className="text-sm text-gray-400 mt-1">{submission.formTitle}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-navy-light/30 text-gray-400 hover:text-white">
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

            {/* Action Buttons — Push to JotForm */}
            {typeof submission.currentApprovalLevel === 'number' && (
              <div className="bg-navy-light/30 rounded-xl p-4 border border-navy-light/20">
                <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <Send className="w-4 h-4 text-gold" />
                  Take Action — Level {submission.currentApprovalLevel}
                  <span className="text-xs text-gray-500 font-normal ml-2">(Pushes to JotForm Enterprise)</span>
                </h4>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApproval('approve')}
                    disabled={approving || rejecting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold transition-all"
                  >
                    {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {approving ? 'Pushing to JotForm...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleApproval('reject')}
                    disabled={approving || rejecting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl font-semibold transition-all"
                  >
                    {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    {rejecting ? 'Pushing to JotForm...' : 'Reject'}
                  </button>
                </div>
                {pushResult && (
                  <div className={`mt-3 p-3 rounded-lg text-sm font-medium ${
                    pushResult.success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {pushResult.success ? '✅ Successfully pushed to JotForm Enterprise!' : `❌ ${pushResult.message}`}
                  </div>
                )}
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
