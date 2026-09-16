import { roles } from '@lms/shared';

export const DEMO_PASSWORD = 'LmsDemo!2026';
export const seedAccounts = roles.map((role) => ({
  role, email: `${role.toLowerCase()}@lms.example.test`, seedKey: `lms-development-${role.toLowerCase()}`,
}));
