export type ApprovalLevel = 1 | 2 | 3 | 4;
export type SubmissionStatus = 'pending' | 'completed' | 'rejected';
export type OverallStatus = 'on-track' | 'delayed' | 'critical';

export interface Submission {
  id: string;
  formId: string;
  formTitle: string;
  referenceNumber: string;
  title: string;
  description: string;
  submittedBy: {
    name: string;
    nameAr?: string;
    department: string;
    email: string;
  };
  submissionDate: string;
  currentApprovalLevel: ApprovalLevel | 'completed' | 'rejected';
  approvalHistory: ApprovalEntry[];
  daysAtCurrentLevel: number;
  totalDaysSinceSubmission: number;
  overallStatus: OverallStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  answers: Record<string, string>;
}

export interface ApprovalEntry {
  level: ApprovalLevel;
  approverName: string;
  approverNameAr?: string;
  status: 'approved' | 'pending' | 'rejected';
  date?: string;
  comments?: string;
}

export interface FormSummary {
  id: string;
  title: string;
  totalSubmissions: number;
  completed: number;
  pending: number;
  rejected: number;
}

export interface DashboardStats {
  totalForms: number;
  completed: number;
  inProgress: number;
  stuckOver7Days: number;
  stuckOver30Days: number;
  rejected: number;
}

export interface ApprovalLevelStats {
  level: string;
  count: number;
  avgDays: number;
  color: string;
}

export interface DepartmentStats {
  department: string;
  total: number;
  completed: number;
  pending: number;
  rejected: number;
}

export interface TrendDataPoint {
  date: string;
  completed: number;
  submitted: number;
  rejected: number;
}

export interface BottleneckData {
  level: string;
  stuckCount: number;
  avgWaitDays: number;
  longestWaitDays: number;
  topApprovers: { name: string; pending: number }[];
}

export interface HeatmapCell {
  day: string;
  hour: string;
  value: number;
}

export interface ApiConfig {
  apiKey: string;
  formIds: string[];
  baseUrl: string;
  isConnected: boolean;
  useDemoData: boolean;
}

export interface RefreshConfig {
  autoRefresh: boolean;
  intervalMinutes: number;
  lastUpdated: string | null;
}

export type SortDirection = 'asc' | 'desc';
export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export interface FilterConfig {
  approvalLevel: string;
  department: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export interface PaginationConfig {
  page: number;
  perPage: number;
  total: number;
}
