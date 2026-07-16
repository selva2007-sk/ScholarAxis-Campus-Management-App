import { Scholarship, Application, Notification, User, ApplicationStatus, UserRole, AdminReminder } from '../types';
import { MOCK_USERS, MOCK_SCHOLARSHIPS, MOCK_APPLICATIONS } from '../mockData';
import { sendAdminDecisionEmail, sendScholarshipDecisionEmail } from './emailService';
import { adminAlertEmails, isAdminEmailJsConfigured } from '../src/config';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const SYSTEM_ADMIN_ID = 'admin1';
const SYSTEM_ADMIN_EMAIL = 'admin@srec.com';
const MANAGED_ACADEMIC_ROLES = new Set<UserRole>([
  UserRole.STUDENT,
  UserRole.TUTOR,
  UserRole.COORDINATOR,
  UserRole.HOD
]);

const isManagedAcademicRole = (role: UserRole): boolean => MANAGED_ACADEMIC_ROLES.has(role);

const isSystemAdminUser = (user?: User): boolean =>
  !!user &&
  user.role === UserRole.ADMIN &&
  (user.id === SYSTEM_ADMIN_ID || normalizeWhitespace(user.email).toLowerCase() === SYSTEM_ADMIN_EMAIL);


const normalizeDepartmentValue = (value: string): string => {
  const cleaned = normalizeWhitespace(value || '');
  const key = cleaned.toLowerCase();
  if (!key) return cleaned;

  const aliases: Record<string, string> = {
    'computer science': 'Computer Science Engineering',
    'computer science engineering': 'Computer Science Engineering',
    'information technology': 'Information Technology',
    it: 'Information Technology',
    'academic affairs': 'Academic Affairs',
    'student welfare': 'Student Welfare',
    administration: 'Administration'
  };

  return aliases[key] || cleaned;
};

const normalizeDepartmentEligibility = (value?: string): string => {
  const cleaned = normalizeWhitespace(value || 'All');
  if (cleaned.toLowerCase() === 'all') return 'All';
  return normalizeDepartmentValue(cleaned);
};

const getApprovalStatus = (application: Application, role: UserRole): string => {
  const history = Array.isArray(application.approvalHistory) ? application.approvalHistory : [];
  const entry = [...history].reverse().find(item => item.role === role);
  if (!entry?.action) return 'Pending';
  return entry.action === 'Approved' ? '✅ Approved' : '❌ Rejected';
};

const buildYearAndSection = (student?: User, fallbackSection?: string): string => {
  const semester = typeof student?.semester === 'number' ? student?.semester : undefined;
  const year = semester ? Math.max(1, Math.ceil(semester / 2)) : undefined;
  const yearLabel = year ? `Year ${year}` : 'Year N/A';
  const sectionValue = normalizeWhitespace(fallbackSection || student?.section || '').toUpperCase();
  const sectionLabel = sectionValue ? `Section ${sectionValue}` : 'Section N/A';
  return `${yearLabel} / ${sectionLabel}`;
};

const isValidStatus = (value: unknown): value is ApplicationStatus =>
  Object.values(ApplicationStatus).includes(value as ApplicationStatus);

class MockFirestore {
  private static DATA_VERSION = 2;

  private static STORAGE_KEYS = {
    SCHOLARSHIPS: 'sf_scholarships',
    APPLICATIONS: 'sf_applications',
    NOTIFICATIONS: 'sf_notifications',
    USERS: 'sf_users',
    REMINDERS: 'sf_admin_reminders',
    VERSION: 'sf_data_version',
    SEED_SIGNATURE: 'sf_seed_signature'
  };

  private static getSeedSignature(): string {
    return JSON.stringify({
      users: MOCK_USERS,
      scholarships: MOCK_SCHOLARSHIPS,
      applications: MOCK_APPLICATIONS
    });
  }

  constructor() {
    this.initialize();
  }

  private generateUserId(): string {
    return `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private ensureSystemAdminCanManageAcademicUsers(actor: User | undefined, action: string): void {
    if (isSystemAdminUser(actor)) return;
    throw new AuthError(`Only System Admin can ${action} Student, Tutor, Academic Coordinator, and HOD accounts.`);
  }

  private initialize() {
    const version = Number(localStorage.getItem(MockFirestore.STORAGE_KEYS.VERSION) || 0);
    const currentSeedSignature = MockFirestore.getSeedSignature();
    const storedSeedSignature = localStorage.getItem(MockFirestore.STORAGE_KEYS.SEED_SIGNATURE) || '';
    const hasCoreData =
      !!localStorage.getItem(MockFirestore.STORAGE_KEYS.USERS) &&
      !!localStorage.getItem(MockFirestore.STORAGE_KEYS.SCHOLARSHIPS) &&
      !!localStorage.getItem(MockFirestore.STORAGE_KEYS.APPLICATIONS);

    // To force a complete reseed manually during development, run: localStorage.clear()
    if (!hasCoreData || version < MockFirestore.DATA_VERSION || storedSeedSignature !== currentSeedSignature) {
      this.seedFromMockData(currentSeedSignature);
      return;
    }

    this.normalizeAndRepairStoredData(currentSeedSignature);
  }

  private seedFromMockData(seedSignature: string = MockFirestore.getSeedSignature()) {
    const users = MOCK_USERS.map(u => this.normalizeUser(u));
    const scholarships = MOCK_SCHOLARSHIPS.map(s => this.normalizeScholarship(s));
    const applications = this.normalizeApplications(MOCK_APPLICATIONS, users, scholarships);

    this.setData(MockFirestore.STORAGE_KEYS.USERS, users);
    this.setData(MockFirestore.STORAGE_KEYS.SCHOLARSHIPS, scholarships);
    this.setData(MockFirestore.STORAGE_KEYS.APPLICATIONS, applications);
    this.setData(MockFirestore.STORAGE_KEYS.NOTIFICATIONS, []);
    this.setData(MockFirestore.STORAGE_KEYS.REMINDERS, []);
    localStorage.setItem(MockFirestore.STORAGE_KEYS.VERSION, String(MockFirestore.DATA_VERSION));
    localStorage.setItem(MockFirestore.STORAGE_KEYS.SEED_SIGNATURE, seedSignature);
  }

  private normalizeAndRepairStoredData(seedSignature: string = MockFirestore.getSeedSignature()) {
    const users = this.getData<User>(MockFirestore.STORAGE_KEYS.USERS).map(u => this.normalizeUser(u));
    const scholarships = this.getData<Scholarship>(MockFirestore.STORAGE_KEYS.SCHOLARSHIPS).map(s => this.normalizeScholarship(s));

    if (users.length === 0 || scholarships.length === 0) {
      this.seedFromMockData();
      return;
    }

    const applications = this.normalizeApplications(
      this.getData<Application>(MockFirestore.STORAGE_KEYS.APPLICATIONS),
      users,
      scholarships
    );
    const notifications = this.getData<Notification>(MockFirestore.STORAGE_KEYS.NOTIFICATIONS);
    const reminders = this.getData<AdminReminder>(MockFirestore.STORAGE_KEYS.REMINDERS);

    this.setData(MockFirestore.STORAGE_KEYS.USERS, users);
    this.setData(MockFirestore.STORAGE_KEYS.SCHOLARSHIPS, scholarships);
    this.setData(MockFirestore.STORAGE_KEYS.APPLICATIONS, applications);
    this.setData(MockFirestore.STORAGE_KEYS.NOTIFICATIONS, notifications);
    this.setData(MockFirestore.STORAGE_KEYS.REMINDERS, reminders);
    localStorage.setItem(MockFirestore.STORAGE_KEYS.VERSION, String(MockFirestore.DATA_VERSION));
    localStorage.setItem(MockFirestore.STORAGE_KEYS.SEED_SIGNATURE, seedSignature);
  }

  private normalizeUser(user: User): User {
    return {
      ...user,
      name: normalizeWhitespace(user.name),
      email: normalizeWhitespace(user.email).toLowerCase(),
      department: normalizeDepartmentValue(user.department),
      regNo: user.regNo ? normalizeWhitespace(user.regNo).toUpperCase() : user.regNo,
      employeeId: user.employeeId ? normalizeWhitespace(user.employeeId).toUpperCase() : user.employeeId,
      section: user.section ? normalizeWhitespace(user.section).toUpperCase() : user.section,
      batch: user.batch ? normalizeWhitespace(user.batch) : user.batch
    };
  }

  private normalizeScholarship(scholarship: Scholarship): Scholarship {
    const createdAt = Number(scholarship.createdAt);
    const deadline = Number(scholarship.deadline);

    return {
      ...scholarship,
      name: normalizeWhitespace(scholarship.name),
      description: normalizeWhitespace(scholarship.description),
      departmentEligibility: normalizeDepartmentEligibility(scholarship.departmentEligibility),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      deadline: Number.isFinite(deadline) ? deadline : Date.now() + 30 * 86400000,
      isActive: scholarship.isActive !== false
    };
  }

  private normalizeApplications(applications: Application[], users: User[], scholarships: Scholarship[]): Application[] {
    const usersById = new Map(users.map(u => [u.id, u]));
    const scholarshipsById = new Map(scholarships.map(s => [s.id, s]));

    const tutors = users.filter(u => u.role === UserRole.TUTOR);
    const coordinators = users.filter(u => u.role === UserRole.COORDINATOR);
    const hods = users.filter(u => u.role === UserRole.HOD);

    return applications.map(app => {
      const student =
        usersById.get(app.studentId) ||
        users.find(u => u.role === UserRole.STUDENT && u.regNo && u.regNo === normalizeWhitespace(app.regNo).toUpperCase());

      const studentDepartment = normalizeDepartmentValue(student?.department || app.department || '');
      const preferredTutor = usersById.get(app.tutorId);
      const preferredCoordinator = usersById.get(app.coordinatorId);
      const preferredHod = usersById.get(app.hodId);

      const tutor =
        (preferredTutor &&
          preferredTutor.role === UserRole.TUTOR &&
          normalizeDepartmentValue(preferredTutor.department) === studentDepartment &&
          preferredTutor) ||
        tutors.find(t => normalizeDepartmentValue(t.department) === studentDepartment) ||
        tutors[0];

      const coordinator =
        (preferredCoordinator &&
          preferredCoordinator.role === UserRole.COORDINATOR &&
          [
            studentDepartment,
            'Academic Affairs',
            'Student Welfare'
          ].includes(normalizeDepartmentValue(preferredCoordinator.department)) &&
          preferredCoordinator) ||
        coordinators.find(c =>
          [studentDepartment, 'Academic Affairs', 'Student Welfare'].includes(normalizeDepartmentValue(c.department))
        ) ||
        coordinators[0];

      const hod =
        (preferredHod &&
          preferredHod.role === UserRole.HOD &&
          normalizeDepartmentValue(preferredHod.department) === studentDepartment &&
          preferredHod) ||
        hods.find(h => normalizeDepartmentValue(h.department) === studentDepartment) ||
        hods[0];

      const scholarship =
        scholarshipsById.get(app.scholarshipId) ||
        scholarships.find(s => s.name === app.scholarshipName) ||
        scholarships[0];

      const timestamp = Number(app.timestamp);
      return {
        ...app,
        studentId: student?.id || app.studentId,
        studentName: normalizeWhitespace(student?.name || app.studentName || 'Unknown Student'),
        regNo: normalizeWhitespace(student?.regNo || app.regNo || '').toUpperCase(),
        department: studentDepartment || normalizeDepartmentValue(app.department),
        section: normalizeWhitespace(app.section || student?.section || 'A').toUpperCase(),
        scholarshipId: scholarship?.id || app.scholarshipId,
        scholarshipName: scholarship?.name || app.scholarshipName,
        purpose: normalizeWhitespace(app.purpose || 'Scholarship application'),
        tutorId: tutor?.id || app.tutorId,
        coordinatorId: coordinator?.id || app.coordinatorId,
        hodId: hod?.id || app.hodId,
        status: isValidStatus(app.status) ? app.status : ApplicationStatus.PENDING_TUTOR,
        timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
        approvalHistory: Array.isArray(app.approvalHistory) ? app.approvalHistory : []
      };
    });
  }

  private normalizeIncomingApplication(application: Application): Application {
    const student = this.getUserById(application.studentId);
    const timestamp = Number(application.timestamp);
    return {
      ...application,
      studentName: normalizeWhitespace(application.studentName || student?.name || ''),
      regNo: normalizeWhitespace(application.regNo || student?.regNo || '').toUpperCase(),
      department: normalizeDepartmentValue(application.department || student?.department || ''),
      section: normalizeWhitespace(application.section || student?.section || 'A').toUpperCase(),
      scholarshipName: normalizeWhitespace(application.scholarshipName || ''),
      purpose: normalizeWhitespace(application.purpose || ''),
      status: isValidStatus(application.status) ? application.status : ApplicationStatus.PENDING_TUTOR,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      approvalHistory: Array.isArray(application.approvalHistory) ? application.approvalHistory : []
    };
  }

  private getData<T>(key: string): T[] {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error(`Error reading ${key} from storage:`, e);
      return [];
    }
  }

  private setData<T>(key: string, data: T[]) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Error saving ${key} to storage:`, e);
      throw new Error('Local storage quota exceeded. Changes could not be saved.');
    }
  }

  // --- Users & Auth ---
  getUsers(): User[] {
    return this.getData<User>(MockFirestore.STORAGE_KEYS.USERS);
  }

  getUserById(id: string): User | undefined {
    return this.getUsers().find(u => u.id === id);
  }

  registerUser(user: Omit<User, 'id'>): User {
    if (user.role === UserRole.ADMIN) {
      throw new ValidationError('Admin self-registration is not allowed.');
    }

    if (!isManagedAcademicRole(user.role)) {
      throw new ValidationError('Invalid role selected for registration.');
    }

    const users = this.getUsers();
    const email = normalizeWhitespace(user.email).toLowerCase();
    const department = normalizeDepartmentValue(user.department);

    if (users.some(u => u.email.toLowerCase() === email)) {
      throw new ValidationError('This institutional email is already registered.');
    }

    if (!department) {
      throw new ValidationError('Department is required.');
    }

    const password = normalizeWhitespace(user.password || '');
    if (password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters.');
    }

    const normalizedRegNo = user.regNo ? normalizeWhitespace(user.regNo).toUpperCase() : '';

    if (user.role === UserRole.STUDENT) {
      if (!normalizedRegNo) {
        throw new ValidationError('Register number is required for Student registration.');
      }
      if (users.some(u => (u.regNo || '').toUpperCase() === normalizedRegNo)) {
        throw new ValidationError('This register number is already in use.');
      }
    }

    const currentYear = new Date().getFullYear();
    const normalizedUser = this.normalizeUser({
      ...user,
      id: this.generateUserId(),
      department,
      email,
      password,
      joinYear: user.joinYear || String(currentYear),
      semester: user.role === UserRole.STUDENT ? (user.semester || 1) : undefined
    });

    const allUsers = this.getUsers();
    allUsers.push(normalizedUser);
    this.setData(MockFirestore.STORAGE_KEYS.USERS, allUsers);
    return normalizedUser;
  }

  addUser(user: User, actor: User) {
    const normalizedUser = this.normalizeUser(user);
    if (isManagedAcademicRole(normalizedUser.role)) {
      this.ensureSystemAdminCanManageAcademicUsers(actor, 'add or remove');
    }
    const users = this.getUsers();
    users.push(normalizedUser);
    this.setData(MockFirestore.STORAGE_KEYS.USERS, users);
  }

  updateUser(id: string, updates: Partial<User>, actor: User) {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      const nextRole = (updates.role as UserRole | undefined) || users[index].role;
      if (isManagedAcademicRole(users[index].role) || isManagedAcademicRole(nextRole)) {
        this.ensureSystemAdminCanManageAcademicUsers(actor, 'update');
      }
      users[index] = this.normalizeUser({ ...users[index], ...updates });
      this.setData(MockFirestore.STORAGE_KEYS.USERS, users);
    }
  }

  deleteUser(id: string, actor: User) {
    const existing = this.getUserById(id);
    if (!existing) return;
    if (isSystemAdminUser(existing)) {
      throw new ValidationError('System Admin account cannot be deleted.');
    }
    if (isManagedAcademicRole(existing.role)) {
      this.ensureSystemAdminCanManageAcademicUsers(actor, 'delete');
    }
    const users = this.getUsers().filter(u => u.id !== id);
    this.setData(MockFirestore.STORAGE_KEYS.USERS, users);
  }

  authenticate(email: string, password: string, role: UserRole): User {
    const users = this.getUsers();
    const normalizedEmail = normalizeWhitespace(email).toLowerCase();
    const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

    if (!user) throw new AuthError('This institutional email is not registered.');
    if (user.role !== role) throw new AuthError(`Role mismatch. Registered as ${user.role}.`);
    if (user.password !== password) throw new AuthError('Invalid credentials.');

    return user;
  }

  // --- Scholarships ---
  getScholarships(): Scholarship[] {
    return this.getData<Scholarship>(MockFirestore.STORAGE_KEYS.SCHOLARSHIPS);
  }

  addScholarship(scholarship: Scholarship) {
    const data = this.getScholarships();
    data.push(this.normalizeScholarship({ ...scholarship, isActive: scholarship.isActive !== false }));
    this.setData(MockFirestore.STORAGE_KEYS.SCHOLARSHIPS, data);
  }

  deleteScholarship(id: string) {
    const data = this.getScholarships().filter(s => s.id !== id);
    this.setData(MockFirestore.STORAGE_KEYS.SCHOLARSHIPS, data);
  }

  toggleScholarship(id: string) {
    const data = this.getScholarships().map(s => (s.id === id ? { ...s, isActive: !s.isActive } : s));
    this.setData(MockFirestore.STORAGE_KEYS.SCHOLARSHIPS, data);
  }

  // --- Reminders ---
  getReminders(): AdminReminder[] {
    return this.getData<AdminReminder>(MockFirestore.STORAGE_KEYS.REMINDERS);
  }

  addReminder(reminder: AdminReminder) {
    const data = this.getReminders();
    data.push(reminder);
    this.setData(MockFirestore.STORAGE_KEYS.REMINDERS, data);
  }

  deleteReminder(id: string) {
    const data = this.getReminders().filter(r => r.id !== id);
    this.setData(MockFirestore.STORAGE_KEYS.REMINDERS, data);
  }

  toggleReminder(id: string) {
    const data = this.getReminders().map(r => (r.id === id ? { ...r, isCompleted: !r.isCompleted } : r));
    this.setData(MockFirestore.STORAGE_KEYS.REMINDERS, data);
  }

  // --- Applications & Routing Logic ---
  getApplications(): Application[] {
    return this.getData<Application>(MockFirestore.STORAGE_KEYS.APPLICATIONS);
  }

  /**
   * Strictly validates that the assigned authorities belong to the correct department/hierarchy.
   */
  private validateRouting(studentId: string, tutorId: string, coordinatorId: string, hodId: string) {
    const student = this.getUserById(studentId);
    const tutor = this.getUserById(tutorId);
    const coordinator = this.getUserById(coordinatorId);
    const hod = this.getUserById(hodId);

    if (!student) throw new ValidationError('Invalid student ID.');
    if (!tutor) throw new ValidationError('Invalid tutor selected.');
    if (!coordinator) throw new ValidationError('Invalid coordinator selected.');
    if (!hod) throw new ValidationError('Invalid HOD selected.');

    const studentDepartment = normalizeDepartmentValue(student.department);
    const tutorDepartment = normalizeDepartmentValue(tutor.department);
    const coordinatorDepartment = normalizeDepartmentValue(coordinator.department);
    const hodDepartment = normalizeDepartmentValue(hod.department);

    if (tutorDepartment !== studentDepartment) {
      throw new ValidationError(`Tutor must belong to the ${studentDepartment} department.`);
    }

    if (!([studentDepartment, 'Academic Affairs', 'Student Welfare'].includes(coordinatorDepartment))) {
      throw new ValidationError('Coordinator must belong to student department, Academic Affairs, or Student Welfare.');
    }

    if (hodDepartment !== studentDepartment) {
      throw new ValidationError(`HOD must belong to the ${studentDepartment} department.`);
    }

    if (tutor.role !== UserRole.TUTOR) throw new ValidationError('Selected user is not a Tutor.');
    if (coordinator.role !== UserRole.COORDINATOR) throw new ValidationError('Selected user is not a Coordinator.');
    if (hod.role !== UserRole.HOD) throw new ValidationError('Selected user is not an HOD.');
  }

  addApplication(application: Application) {
    const normalizedApplication = this.normalizeIncomingApplication(application);

    // 1. Perform Strict Routing Validation
    this.validateRouting(
      normalizedApplication.studentId,
      normalizedApplication.tutorId,
      normalizedApplication.coordinatorId,
      normalizedApplication.hodId
    );

    // 2. Persist
    const data = this.getApplications();
    data.push(normalizedApplication);
    this.setData(MockFirestore.STORAGE_KEYS.APPLICATIONS, data);

    // 3. Notify the first approver (Tutor)
    this.addNotification({
      id: 'ntf-' + Date.now(),
      userId: normalizedApplication.tutorId,
      title: 'Action Required',
      message: `${normalizedApplication.studentName} has submitted a new application for review.`,
      status: 'unread',
      timestamp: Date.now()
    });
  }

  updateApplication(id: string, updates: Partial<Application>, actor: User) {
    const data = this.getApplications();
    const index = data.findIndex(app => app.id === id);

    if (index === -1) throw new Error('Application not found');

    const app = data[index];

    // Security Check: Ensure actor is authorized for this specific transition
    if (updates.status) {
      if (updates.status !== ApplicationStatus.REJECTED && updates.status !== ApplicationStatus.APPROVED) {
        if (app.status === ApplicationStatus.PENDING_TUTOR && (actor.role !== UserRole.TUTOR || actor.id !== app.tutorId)) {
          throw new Error('Only the assigned Tutor can approve at this stage.');
        }
        if (
          app.status === ApplicationStatus.PENDING_COORDINATOR &&
          (actor.role !== UserRole.COORDINATOR || actor.id !== app.coordinatorId)
        ) {
          throw new Error('Only the assigned Coordinator can approve at this stage.');
        }
        if (app.status === ApplicationStatus.PENDING_HOD && (actor.role !== UserRole.HOD || actor.id !== app.hodId)) {
          throw new Error('Only the assigned HOD can approve at this stage.');
        }
      }
    }

    const updatedApp = { ...app, ...updates };
    data[index] = updatedApp;
    this.setData(MockFirestore.STORAGE_KEYS.APPLICATIONS, data);

    // Notification Logic for State Transitions
    if (updates.status) {
      let msg = '';
      let recipientId = app.studentId;
      let title = 'Status Update';

      if (updates.status === ApplicationStatus.APPROVED) {
        msg = `Congratulations! Your application for ${app.scholarshipName} has been FINAL APPROVED by the HOD.`;
        title = 'Application Approved';
      } else if (updates.status === ApplicationStatus.REJECTED) {
        msg = `Your application for ${app.scholarshipName} was returned by ${actor.name} (${actor.role}).`;
        title = 'Action Returned';
      } else {
        msg = `Your application is moving to the next stage: ${updates.status}.`;
      }

      this.addNotification({
        id: 'ntf-' + Date.now(),
        userId: recipientId,
        title,
        message: msg,
        status: 'unread',
        timestamp: Date.now()
      });

      if (updates.status === ApplicationStatus.PENDING_COORDINATOR && this.getUserById(app.coordinatorId)) {
        this.addNotification({
          id: 'ntf-next-' + Date.now(),
          userId: app.coordinatorId,
          title: 'Review Pending',
          message: `Tutor verified ${app.studentName}'s application. Awaiting your audit.`,
          status: 'unread',
          timestamp: Date.now()
        });
      } else if (updates.status === ApplicationStatus.PENDING_HOD && this.getUserById(app.hodId)) {
        this.addNotification({
          id: 'ntf-next-' + Date.now(),
          userId: app.hodId,
          title: 'Final Approval Needed',
          message: `Coordinator audited ${app.studentName}'s application. Awaiting HOD signature.`,
          status: 'unread',
          timestamp: Date.now()
        });
      }

      if (updates.status === ApplicationStatus.APPROVED || updates.status === ApplicationStatus.REJECTED) {
        const student = this.getUserById(app.studentId);
        const yearAndSection = buildYearAndSection(student, app.section);
        const mobileNumber = normalizeWhitespace(student?.mobileNumber || '');
        if (student?.email) {
          void sendScholarshipDecisionEmail(
            student.email,
            app.studentName,
            updatedApp,
            updates.status,
            actor,
            { yearAndSection, mobileNumber }
          ).catch(error => {
            console.error('Failed to send scholarship decision email:', error);
          });
        }

        if (isAdminEmailJsConfigured()) {
          const allUsers = this.getUsers();
          const adminEmails = Array.from(
            new Set(
              allUsers
                .filter(u => u.role === UserRole.ADMIN && u.email)
                .map(u => normalizeWhitespace(u.email).toLowerCase())
            )
          );
          const recipients =
            adminAlertEmails.length > 0
              ? adminAlertEmails
              : (adminEmails.length > 0 ? adminEmails : [SYSTEM_ADMIN_EMAIL]);
          const yearAndSection = buildYearAndSection(student, app.section);
          const mobileNumber = normalizeWhitespace(student?.mobileNumber || '');
          const facultyStatus = getApprovalStatus(updatedApp, UserRole.TUTOR);
          const coordinatorStatus = getApprovalStatus(updatedApp, UserRole.COORDINATOR);
          const hodStatus = getApprovalStatus(updatedApp, UserRole.HOD);

          void Promise.all(
            recipients.map(email =>
              sendAdminDecisionEmail({
                toEmail: email,
                studentName: app.studentName,
                regNo: app.regNo,
                department: app.department,
                scholarshipName: app.scholarshipName,
                yearAndSection,
                mobileNumber,
                decisionStatus: updates.status,
                reviewedBy: actor.name,
                reviewerRole: actor.role,
                facultyStatus,
                coordinatorStatus,
                hodStatus,
                finalStatus: updates.status,
                institutionName: 'Sri Ramakrishna Engineering College'
              })
            )
          ).catch(error => {
            console.error('Admin decision email failed:', error);
          });
        }
      }
    }
  }

  // --- Notifications ---
  getNotifications(userId: string): Notification[] {
    return this.getData<Notification>(MockFirestore.STORAGE_KEYS.NOTIFICATIONS)
      .filter(n => n.userId === userId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  addNotification(notification: Notification) {
    const data = this.getData<Notification>(MockFirestore.STORAGE_KEYS.NOTIFICATIONS);
    data.push(notification);
    this.setData(MockFirestore.STORAGE_KEYS.NOTIFICATIONS, data);
  }

  markAllNotificationsRead(userId: string) {
    const data = this.getData<Notification>(MockFirestore.STORAGE_KEYS.NOTIFICATIONS).map(n =>
      n.userId === userId ? { ...n, status: 'read' as const } : n
    );
    this.setData(MockFirestore.STORAGE_KEYS.NOTIFICATIONS, data);
  }
}

export const db = new MockFirestore();
