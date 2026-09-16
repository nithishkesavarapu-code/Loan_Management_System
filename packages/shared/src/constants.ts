export const roles = ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION', 'BORROWER'] as const;
export const employmentModes = ['SALARIED', 'SELF_EMPLOYED', 'UNEMPLOYED'] as const;
export const applicationStates = ['DRAFT', 'SUBMITTED'] as const;
export const loanStatuses = ['APPLIED', 'SANCTIONED', 'REJECTED', 'DISBURSED', 'CLOSED'] as const;

export type Role = (typeof roles)[number];
export type EmploymentMode = (typeof employmentModes)[number];
export type ApplicationState = (typeof applicationStates)[number];
export type LoanStatus = (typeof loanStatuses)[number];
