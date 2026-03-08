export interface UserConfig {
  name: string;
  role: string;
  approvalLevels: number[];
  nameMatches: string[];
  isAdmin?: boolean;
}

export const USER_CONFIGS: Record<string, UserConfig> = {
  'huzaifa.dawasaz@mediaoffice.ae': {
    name: 'Huzaifa Dawasaz',
    role: 'Director',
    approvalLevels: [3],
    nameMatches: ['huzaifa', 'dawasaz', 'director'],
  },
  'bk@bettroi.com': {
    name: 'BK',
    role: 'Admin',
    approvalLevels: [1, 2, 3, 4],
    nameMatches: [],
    isAdmin: true,
  },
  'admin@bettroi.com': {
    name: 'Bettroi Admin',
    role: 'Admin',
    approvalLevels: [1, 2, 3, 4],
    nameMatches: [],
    isAdmin: true,
  },
};

export const DEFAULT_USER_CONFIG: UserConfig = {
  name: 'User',
  role: 'Viewer',
  approvalLevels: [1, 2, 3, 4],
  nameMatches: [],
  isAdmin: true,
};

export const CURRENT_USER = USER_CONFIGS['huzaifa.dawasaz@mediaoffice.ae'];
