
import { User, UserRole, Scholarship, Application, ScholarshipType, Notification, AdminReminder } from './types';

// Current Timestamp for relative deadlines
const NOW = Date.now();
const DAY = 86400000;

export const MOCK_USERS: User[] = [
  // Institutional Admin
  { 
    id: 'admin1', 
    name: 'System Admin', 
    role: UserRole.ADMIN, 
    department: 'Administration', 
    email: 'academic@srec.ac.in', 
    password: 'admin123' 
  }
];

export const MOCK_SCHOLARSHIPS: Scholarship[] = [
  
];

export const MOCK_APPLICATIONS: Application[] = [];

export const MOCK_NOTIFICATIONS: Notification[] = [];

export const MOCK_REMINDERS: AdminReminder[] = [];
