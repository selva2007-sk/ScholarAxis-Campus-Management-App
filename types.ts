
export enum UserRole {
  STUDENT = 'Student',
  TUTOR = 'Tutor',
  COORDINATOR = 'Academic Coordinator',
  HOD = 'HOD',
  ADMIN = 'Admin'
}

export enum ApplicationStatus {
  PENDING_TUTOR = 'Pending Tutor',
  PENDING_COORDINATOR = 'Pending Coordinator',
  PENDING_HOD = 'Pending HOD',
  APPROVED = 'Approved',
  REJECTED = 'Rejected'
}

export enum ScholarshipType {
  INSTITUTIONAL = 'Institutional',
  GOVERNMENT = 'Government'
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  department: string;
  email: string;
  password?: string;
  regNo?: string; // For Students
  mobileNumber?: string; // Contact Number
  employeeId?: string; // For Staff
  section?: string;
  // Academic/Professional Details
  semester?: number;
  batch?: string;
  specialization?: string;
  joinYear?: string;
  // New Fields
  prevSemesterGPA?: number;
  completedCredits?: number;
  awards?: string;
}

export interface Scholarship {
  id: string;
  name: string;
  description: string;
  amount: number;
  type: ScholarshipType;
  departmentEligibility?: string;
  createdAt: number;
  deadline: number;
  isActive: boolean; // Mandatory state
}

export interface AdminReminder {
  id: string;
  title: string;
  date: number;
  priority: 'low' | 'medium' | 'high';
  isCompleted: boolean;
}

export interface ApprovalEntry {
  role: UserRole;
  action: 'Approved' | 'Rejected';
  timestamp: number;
  userName: string;
  comment?: string;
}

export interface Application {
  id: string;
  studentId: string;
  studentName: string;
  regNo: string;
  department: string;
  section: string;
  scholarshipId: string;
  scholarshipName: string;
  purpose: string;
  tutorId: string;
  coordinatorId: string;
  hodId: string;
  status: ApplicationStatus;
  timestamp: number;
  approvalHistory: ApprovalEntry[];
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  status: 'read' | 'unread';
  timestamp: number;
  route?: NotificationRoute;
}

export interface NotificationRoute {
  screen?: string;
  applicationId?: string;
  scholarshipId?: string;
}
