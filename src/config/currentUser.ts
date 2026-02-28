export const CURRENT_USER = {
  email: 'huzaifa.dawasaz@mediaoffice.ae',
  name: 'Huzaifa Dawasaz',
  role: 'Director',
  // Director is Level 3 approver in the 4-level workflow:
  // Level 1: Ahmad Al Rashid (Department Head)
  // Level 2: Fatima Al Hassan (Division Manager)
  // Level 3: Huzaifa Dawasaz (Director) ← current user
  // Level 4: Mohammed Al Falasi (Executive Director)
  approvalLevels: [3],
  nameMatches: ['huzaifa', 'dawasaz', 'director'],
};
