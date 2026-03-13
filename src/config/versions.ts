/**
 * Version registry for JotFlow
 *
 * Each deploy should be tagged and recorded here.
 * Set SHOW_VERSION_PAGE to false before go-live to hide the page from clients.
 */

export const SHOW_VERSION_PAGE = true;

export interface VersionEntry {
  version: string;
  date: string;
  commit: string;
  type: 'major' | 'minor' | 'patch';
  description: string;
  changes: string[];
}

export const CURRENT_VERSION = 'v1.3.0';

export const VERSION_HISTORY: VersionEntry[] = [
  {
    version: 'v1.3.0',
    date: '2026-03-13',
    commit: 'f6ccb3d',
    type: 'minor',
    description: 'Mark as Done for form/task workflow steps',
    changes: [
      'Added "Mark as Done" button for form and task workflow steps',
      'Form/task steps skip digital signature requirement',
      'Server-side signature bypass via _stepType param',
      'Direct handleApproval call (no two-step confirmation for form/task)',
      'Solid green button styling for Mark as Done',
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-03-13',
    commit: '906835e',
    type: 'minor',
    description: 'Pending With column shows correct email at all levels',
    changes: [
      'Removed "Tracked in JotForm" label — always show assignee email',
      'Overall Status no longer overrides per-level field detection for multi-level forms',
      'Fixed stale "Completed" status on submissions that were approved as single-level',
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-03-13',
    commit: '104527c',
    type: 'minor',
    description: 'Form workflow config updates for 3-level workflows',
    changes: [
      'Updated Form (260561554311046) to 3-level workflow: Approve & Sign → Form → Task',
      'Fixed Form demo Level 3 assignee to Husaifa\'s email',
      'Updated STEP_TYPE_CONFIG and STEP_ASSIGNEE_CONFIG to match Workflow Builder',
      'Updated FORM_LEVELS in ensure-fields.ts',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-03-13',
    commit: 'c2b3f59',
    type: 'major',
    description: 'Baseline — auto-create fields, full approve/reject from JotFlow',
    changes: [
      'Auto-create approval fields for forms without them (ensure-fields API)',
      'Full approve/reject workflow from JotFlow dashboard',
      'Assignee emails for all forms in Pending With column',
      'Review & Sign for multi-level forms',
      'Security hardening and error boundary',
      'Signature required at all approval levels',
      'Role-based approval buttons with designated approver check',
      'Dynamic form discovery with field detection heuristics',
      'Sign & Approve in JotForm (full-screen iframe)',
      'Live JotForm sync to Supabase',
    ],
  },
];
