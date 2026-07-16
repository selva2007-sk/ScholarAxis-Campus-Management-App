import {
  AdminReminder,
  Application,
  ApplicationStatus,
  Notification,
  Scholarship,
  User,
  UserRole
} from '../types';
import {
  MOCK_APPLICATIONS,
  MOCK_NOTIFICATIONS,
  MOCK_REMINDERS,
  MOCK_SCHOLARSHIPS,
  MOCK_USERS
} from '../mockData';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { firestore } from '../src/firebase';
import { adminAlertEmails, isAdminEmailJsConfigured, isEmailJsConfigured, useClientDecisionEmail } from '../src/config';
import { sendScholarshipStatusEmail } from '../src/sendEmail';
import { sendAdminDecisionEmail } from './emailService';

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

const COLLECTIONS = {
  USERS: 'users',
  SCHOLARSHIPS: 'scholarships',
  APPLICATIONS: 'applications',
  NOTIFICATIONS: 'notifications',
  REMINDERS: 'reminders'
} as const;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const SYSTEM_ADMIN_ID = 'admin1';
const SYSTEM_ADMIN_EMAIL = 'admin@srec.com';
const INSTITUTION_NAME = 'Sri Ramakrishna Engineering College';
const LEGACY_DUMMY_USER_ID_PATTERN = /^(s|t|c|h)\d+$/i;

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

const buildYearAndSection = (student?: User, fallbackSection?: string): string => {
  const semester = typeof student?.semester === 'number' ? student?.semester : undefined;
  const year = semester ? Math.max(1, Math.ceil(semester / 2)) : undefined;
  const yearLabel = year ? `Year ${year}` : 'Year N/A';
  const sectionValue = normalizeWhitespace(fallbackSection || student?.section || '').toUpperCase();
  const sectionLabel = sectionValue ? `Section ${sectionValue}` : 'Section N/A';
  return `${yearLabel} / ${sectionLabel}`;
};

const getApprovalStatus = (application: Application, role: UserRole): string => {
  const history = Array.isArray(application.approvalHistory) ? application.approvalHistory : [];
  const entry = [...history].reverse().find(item => item.role === role);
  if (!entry?.action) return 'Pending';
  return entry.action === 'Approved' ? '✅ Approved' : '❌ Rejected';
};

const formatFinalStatus = (status: ApplicationStatus): string => {
  if (status === ApplicationStatus.APPROVED) return '✅ Approved';
  if (status === ApplicationStatus.REJECTED) return '❌ Rejected';
  return status;
};

const isValidStatus = (value: unknown): value is ApplicationStatus =>
  Object.values(ApplicationStatus).includes(value as ApplicationStatus);

type EmailNotificationMeta = {
  lastNotifiedStatus?: string;
  source?: string;
  lastNotifiedAt?: number;
};

type ApplicationWithEmailMeta = Application & {
  emailNotification?: EmailNotificationMeta;
};

interface DatabaseService {
  getUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | undefined>;
  registerUser(user: Omit<User, 'id'>): Promise<User>;
  addUser(user: User, actor: User): Promise<void>;
  updateUser(id: string, updates: Partial<User>, actor: User): Promise<void>;
  deleteUser(id: string, actor: User): Promise<void>;
  authenticate(email: string, password: string, role: UserRole): Promise<User>;
  getScholarships(): Promise<Scholarship[]>;
  addScholarship(scholarship: Scholarship): Promise<void>;
  deleteScholarship(id: string): Promise<void>;
  toggleScholarship(id: string): Promise<void>;
  getApplications(): Promise<Application[]>;
  addApplication(application: Application): Promise<void>;
  updateApplication(id: string, updates: Partial<Application>, actor: User): Promise<void>;
  getNotifications(userId: string): Promise<Notification[]>;
  addNotification(notification: Notification): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  clearNotifications(userId: string): Promise<void>;
  getReminders(): Promise<AdminReminder[]>;
  addReminder(reminder: AdminReminder): Promise<void>;
  deleteReminder(id: string): Promise<void>;
  toggleReminder(id: string): Promise<void>;
}

class FirebaseDbService implements DatabaseService {
  private initializationPromise: Promise<void> | null = null;

  private generateUserId(): string {
    return `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private ensureSystemAdminCanManageAcademicUsers(actor: User | undefined, action: string): void {
    if (isSystemAdminUser(actor)) return;
    throw new AuthError(`Only System Admin can ${action} Student, Tutor, Academic Coordinator, and HOD accounts.`);
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

  private normalizeIncomingApplication(application: Application, student?: User): Application {
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
          [studentDepartment, 'Academic Affairs', 'Student Welfare'].includes(
            normalizeDepartmentValue(preferredCoordinator.department)
          ) &&
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

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.syncBaselineSeedData().catch(error => {
        this.initializationPromise = null;
        throw error;
      });
    }

    await this.initializationPromise;
  }

  private async syncBaselineSeedData(): Promise<void> {
    const users = MOCK_USERS.map(u => this.normalizeUser(u));
    const scholarships = MOCK_SCHOLARSHIPS.map(s => this.normalizeScholarship(s));
    const applications = this.normalizeApplications(MOCK_APPLICATIONS, users, scholarships);
    const notifications = [...MOCK_NOTIFICATIONS];
    const reminders = [...MOCK_REMINDERS];
    const batch = writeBatch(firestore);
    const seedUserIds = new Set(users.map(u => u.id));
    const seedApplicationIds = new Set(applications.map(a => a.id));

    const [existingUsersSnapshot, existingApplicationsSnapshot] = await Promise.all([
      getDocs(collection(firestore, COLLECTIONS.USERS)),
      getDocs(collection(firestore, COLLECTIONS.APPLICATIONS))
    ]);

    existingUsersSnapshot.docs.forEach(userDoc => {
      const existingUser = {
        ...(userDoc.data() as Omit<User, 'id'>),
        id: userDoc.id
      } as User;

      const isLegacyDummyUser =
        !seedUserIds.has(existingUser.id) &&
        isManagedAcademicRole(existingUser.role) &&
        LEGACY_DUMMY_USER_ID_PATTERN.test(existingUser.id);

      if (isLegacyDummyUser) {
        batch.delete(doc(firestore, COLLECTIONS.USERS, existingUser.id));
      }
    });

    existingApplicationsSnapshot.docs.forEach(appDoc => {
      const appId = appDoc.id;
      const isLegacySeedApplication = appId.startsWith('app_seed_') && !seedApplicationIds.has(appId);

      if (isLegacySeedApplication) {
        batch.delete(doc(firestore, COLLECTIONS.APPLICATIONS, appId));
      }
    });

    users.forEach(user => {
      // Upsert baseline users from mockData.ts
      batch.set(doc(firestore, COLLECTIONS.USERS, user.id), user, { merge: true });
    });

    scholarships.forEach(scholarship => {
      // Upsert baseline scholarships from mockData.ts
      batch.set(doc(firestore, COLLECTIONS.SCHOLARSHIPS, scholarship.id), scholarship, { merge: true });
    });

    applications.forEach(application => {
      // Upsert baseline applications from mockData.ts
      batch.set(doc(firestore, COLLECTIONS.APPLICATIONS, application.id), application, { merge: true });
    });

    notifications.forEach(notification => {
      // Upsert baseline notifications from mockData.ts
      batch.set(doc(firestore, COLLECTIONS.NOTIFICATIONS, notification.id), notification, { merge: true });
    });

    reminders.forEach(reminder => {
      // Upsert baseline reminders from mockData.ts
      batch.set(doc(firestore, COLLECTIONS.REMINDERS, reminder.id), reminder, { merge: true });
    });

    await batch.commit();
  }

  private async getCollectionData<T extends { id: string }>(collectionName: string): Promise<T[]> {
    const snapshot = await getDocs(collection(firestore, collectionName));
    return snapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data() as Omit<T, 'id'>;
      return { ...data, id: docSnapshot.id } as T;
    });
  }

  private async getApplicationById(id: string): Promise<Application | undefined> {
    await this.ensureInitialized();
    const snapshot = await getDoc(doc(firestore, COLLECTIONS.APPLICATIONS, id));
    if (!snapshot.exists()) return undefined;
    return {
      ...(snapshot.data() as Omit<Application, 'id'>),
      id: snapshot.id
    } as Application;
  }

  async getUsers(): Promise<User[]> {
    await this.ensureInitialized();
    const users = await this.getCollectionData<User>(COLLECTIONS.USERS);
    return users.map(u => this.normalizeUser(u));
  }

  async getUserById(id: string): Promise<User | undefined> {
    await this.ensureInitialized();
    const snapshot = await getDoc(doc(firestore, COLLECTIONS.USERS, id));
    if (!snapshot.exists()) return undefined;
    return this.normalizeUser({
      ...(snapshot.data() as Omit<User, 'id'>),
      id: snapshot.id
    } as User);
  }

  async registerUser(user: Omit<User, 'id'>): Promise<User> {
    await this.ensureInitialized();

    if (user.role === UserRole.ADMIN) {
      throw new ValidationError('Admin self-registration is not allowed.');
    }

    if (!isManagedAcademicRole(user.role)) {
      throw new ValidationError('Invalid role selected for registration.');
    }

    const users = await this.getUsers();
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

    await setDoc(doc(firestore, COLLECTIONS.USERS, normalizedUser.id), normalizedUser);
    return normalizedUser;
  }

  async addUser(user: User, actor: User): Promise<void> {
    await this.ensureInitialized();
    const normalizedUser = this.normalizeUser(user);
    if (isManagedAcademicRole(normalizedUser.role)) {
      this.ensureSystemAdminCanManageAcademicUsers(actor, 'add or remove');
    }
    await setDoc(doc(firestore, COLLECTIONS.USERS, normalizedUser.id), normalizedUser);
  }

  async updateUser(id: string, updates: Partial<User>, actor: User): Promise<void> {
    await this.ensureInitialized();
    const existing = await this.getUserById(id);
    if (!existing) return;
    const nextRole = (updates.role as UserRole | undefined) || existing.role;

    if (isManagedAcademicRole(existing.role) || isManagedAcademicRole(nextRole)) {
      this.ensureSystemAdminCanManageAcademicUsers(actor, 'update');
    }

    const merged = this.normalizeUser({ ...existing, ...updates });
    await setDoc(doc(firestore, COLLECTIONS.USERS, id), merged, { merge: true });
  }

  async deleteUser(id: string, actor: User): Promise<void> {
    await this.ensureInitialized();
    const existing = await this.getUserById(id);
    if (!existing) return;
    if (isSystemAdminUser(existing)) {
      throw new ValidationError('System Admin account cannot be deleted.');
    }
    if (isManagedAcademicRole(existing.role)) {
      this.ensureSystemAdminCanManageAcademicUsers(actor, 'delete');
    }
    await deleteDoc(doc(firestore, COLLECTIONS.USERS, id));
  }

  async authenticate(email: string, password: string, role: UserRole): Promise<User> {
    const users = await this.getUsers();
    const normalizedEmail = normalizeWhitespace(email).toLowerCase();
    const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

    if (!user) throw new AuthError('This institutional email is not registered.');
    if (user.role !== role) throw new AuthError(`Role mismatch. Registered as ${user.role}.`);
    if (user.password !== password) throw new AuthError('Invalid credentials.');

    return user;
  }

  async getScholarships(): Promise<Scholarship[]> {
    await this.ensureInitialized();
    const scholarships = await this.getCollectionData<Scholarship>(COLLECTIONS.SCHOLARSHIPS);
    return scholarships.map(s => this.normalizeScholarship(s));
  }

  async addScholarship(scholarship: Scholarship): Promise<void> {
    await this.ensureInitialized();
    const normalized = this.normalizeScholarship({ ...scholarship, isActive: scholarship.isActive !== false });
    await setDoc(doc(firestore, COLLECTIONS.SCHOLARSHIPS, normalized.id), normalized);
  }

  async deleteScholarship(id: string): Promise<void> {
    await this.ensureInitialized();
    await deleteDoc(doc(firestore, COLLECTIONS.SCHOLARSHIPS, id));
  }

  async toggleScholarship(id: string): Promise<void> {
    await this.ensureInitialized();
    const scholarshipRef = doc(firestore, COLLECTIONS.SCHOLARSHIPS, id);
    const scholarshipSnapshot = await getDoc(scholarshipRef);
    if (!scholarshipSnapshot.exists()) return;
    const current = scholarshipSnapshot.data() as Scholarship;
    await updateDoc(scholarshipRef, { isActive: !current.isActive });
  }

  private async validateRouting(studentId: string, tutorId: string, coordinatorId: string, hodId: string): Promise<void> {
    const [student, tutor, coordinator, hod] = await Promise.all([
      this.getUserById(studentId),
      this.getUserById(tutorId),
      this.getUserById(coordinatorId),
      this.getUserById(hodId)
    ]);

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

  async getApplications(): Promise<Application[]> {
    await this.ensureInitialized();

    const [applications, users, scholarships] = await Promise.all([
      this.getCollectionData<Application>(COLLECTIONS.APPLICATIONS),
      this.getUsers(),
      this.getScholarships()
    ]);

    return this.normalizeApplications(applications, users, scholarships);
  }

  async addApplication(application: Application): Promise<void> {
    await this.ensureInitialized();
    const student = await this.getUserById(application.studentId);
    const normalized = this.normalizeIncomingApplication(application, student);

    await this.validateRouting(
      normalized.studentId,
      normalized.tutorId,
      normalized.coordinatorId,
      normalized.hodId
    );

    await setDoc(doc(firestore, COLLECTIONS.APPLICATIONS, normalized.id), normalized);

    await this.addNotification({
      id: 'ntf-' + Date.now(),
      userId: normalized.tutorId,
      title: 'Action Required',
      message: `${normalized.studentName} has submitted a new application for review.`,
      status: 'unread',
      timestamp: Date.now(),
      route: { screen: 'pending' }
    });
  }

  async updateApplication(id: string, updates: Partial<Application>, actor: User): Promise<void> {
    await this.ensureInitialized();
    const app = await this.getApplicationById(id);
    if (!app) throw new Error('Application not found');

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

    const isDecisionStatus =
      updates.status === ApplicationStatus.APPROVED || updates.status === ApplicationStatus.REJECTED;

    const updatedApp: ApplicationWithEmailMeta = { ...app, ...updates };
    if (isDecisionStatus && useClientDecisionEmail) {
      updatedApp.emailNotification = {
        ...updatedApp.emailNotification,
        lastNotifiedStatus: updates.status,
        source: 'client-emailjs',
        lastNotifiedAt: Date.now()
      };
    }

    await setDoc(doc(firestore, COLLECTIONS.APPLICATIONS, id), updatedApp, { merge: true });

    if (!updates.status) return;

    let msg = '';
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

    await this.addNotification({
      id: 'ntf-' + Date.now(),
      userId: app.studentId,
      title,
      message: msg,
      status: 'unread',
      timestamp: Date.now(),
      route: { screen: 'applications' }
    });

    if (updates.status === ApplicationStatus.PENDING_COORDINATOR) {
      await this.addNotification({
        id: 'ntf-next-' + Date.now(),
        userId: app.coordinatorId,
        title: 'Review Pending',
        message: `Tutor verified ${app.studentName}'s application. Awaiting your audit.`,
        status: 'unread',
        timestamp: Date.now(),
        route: { screen: 'pending' }
      });
    } else if (updates.status === ApplicationStatus.PENDING_HOD) {
      await this.addNotification({
        id: 'ntf-next-' + Date.now(),
        userId: app.hodId,
        title: 'Final Approval Needed',
        message: `Coordinator audited ${app.studentName}'s application. Awaiting HOD signature.`,
        status: 'unread',
        timestamp: Date.now(),
        route: { screen: 'pending' }
      });
    }

    const student = isDecisionStatus ? await this.getUserById(app.studentId) : undefined;

    if (isDecisionStatus && useClientDecisionEmail) {
      if (student?.email) {
        const yearAndSection = buildYearAndSection(student, updatedApp.section);
        const mobileNumber = normalizeWhitespace(student?.mobileNumber || '');
        const facultyStatus = getApprovalStatus(updatedApp, UserRole.TUTOR);
        const coordinatorStatus = getApprovalStatus(updatedApp, UserRole.COORDINATOR);
        const hodStatus = getApprovalStatus(updatedApp, UserRole.HOD);

        void sendScholarshipStatusEmail({
          toEmail: student.email,
          studentName: updatedApp.studentName,
          applicationStatus: updates.status,
          scholarshipName: updatedApp.scholarshipName,
          scholarship: updatedApp.scholarshipName,
          regNo: updatedApp.regNo,
          department: updatedApp.department,
          yearSection: yearAndSection,
          mobile: mobileNumber,
          facultyStatus,
          coordinatorStatus,
          hodStatus,
          finalStatus: formatFinalStatus(updates.status),
          institutionName: INSTITUTION_NAME,
          reviewedBy: actor.name,
          reviewerRole: actor.role,
          decisionTime: new Date().toLocaleString(),
          message: msg
        }).catch(error => {
          console.error('EmailJS send failed:', error);
        });
      }
    }

    if (isDecisionStatus && isAdminEmailJsConfigured()) {
      const allUsers = await this.getUsers();
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
      const yearAndSection = buildYearAndSection(student, updatedApp.section);
      const mobileNumber = normalizeWhitespace(student?.mobileNumber || '');
      const facultyStatus = getApprovalStatus(updatedApp, UserRole.TUTOR);
      const coordinatorStatus = getApprovalStatus(updatedApp, UserRole.COORDINATOR);
      const hodStatus = getApprovalStatus(updatedApp, UserRole.HOD);

      void Promise.all(
        recipients.map(email =>
          sendAdminDecisionEmail({
            toEmail: email,
            studentName: updatedApp.studentName,
            regNo: updatedApp.regNo,
            department: updatedApp.department,
            scholarshipName: updatedApp.scholarshipName,
            yearAndSection,
            mobileNumber,
            decisionStatus: updates.status,
            reviewedBy: actor.name,
            reviewerRole: actor.role,
            facultyStatus,
            coordinatorStatus,
            hodStatus,
            finalStatus: formatFinalStatus(updates.status),
            institutionName: INSTITUTION_NAME
          })
        )
      ).catch(error => {
        console.error('Admin decision email failed:', error);
      });
    }

  }

  async getNotifications(userId: string): Promise<Notification[]> {
    await this.ensureInitialized();
    const notifications = await this.getCollectionData<Notification>(COLLECTIONS.NOTIFICATIONS);
    return notifications
      .filter(n => n.userId === userId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async addNotification(notification: Notification): Promise<void> {
    await this.ensureInitialized();
    await setDoc(doc(firestore, COLLECTIONS.NOTIFICATIONS, notification.id), notification);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.ensureInitialized();
    const allNotifications = await this.getCollectionData<Notification>(COLLECTIONS.NOTIFICATIONS);
    const unread = allNotifications.filter(n => n.userId === userId && n.status === 'unread');
    if (unread.length === 0) return;

    const batch = writeBatch(firestore);
    unread.forEach(notification => {
      batch.set(
        doc(firestore, COLLECTIONS.NOTIFICATIONS, notification.id),
        { status: 'read' as const },
        { merge: true }
      );
    });
    await batch.commit();
  }

  async clearNotifications(userId: string): Promise<void> {
    await this.ensureInitialized();
    const allNotifications = await this.getCollectionData<Notification>(COLLECTIONS.NOTIFICATIONS);
    const toDelete = allNotifications.filter(n => n.userId === userId);
    if (toDelete.length === 0) return;

    const batch = writeBatch(firestore);
    toDelete.forEach(notification => {
      batch.delete(doc(firestore, COLLECTIONS.NOTIFICATIONS, notification.id));
    });
    await batch.commit();
  }

  async getReminders(): Promise<AdminReminder[]> {
    await this.ensureInitialized();
    return this.getCollectionData<AdminReminder>(COLLECTIONS.REMINDERS);
  }

  async addReminder(reminder: AdminReminder): Promise<void> {
    await this.ensureInitialized();
    await setDoc(doc(firestore, COLLECTIONS.REMINDERS, reminder.id), reminder);
  }

  async deleteReminder(id: string): Promise<void> {
    await this.ensureInitialized();
    await deleteDoc(doc(firestore, COLLECTIONS.REMINDERS, id));
  }

  async toggleReminder(id: string): Promise<void> {
    await this.ensureInitialized();
    const reminderRef = doc(firestore, COLLECTIONS.REMINDERS, id);
    const reminderSnapshot = await getDoc(reminderRef);
    if (!reminderSnapshot.exists()) return;
    const reminder = reminderSnapshot.data() as AdminReminder;
    await updateDoc(reminderRef, { isCompleted: !reminder.isCompleted });
  }
}

export const db: DatabaseService = new FirebaseDbService();
