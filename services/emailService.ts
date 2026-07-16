import { Application, ApplicationStatus, User, UserRole } from '../types';
import { emailJsConfig } from '../src/config';
import { sendScholarshipStatusEmail } from '../src/sendEmail';

const isDecisionStatus = (status: ApplicationStatus): boolean =>
  status === ApplicationStatus.APPROVED || status === ApplicationStatus.REJECTED;

const INSTITUTION_NAME = 'Sri Ramakrishna Engineering College';

const getApprovalStatus = (application: Application, role: UserRole): string => {
  const history = Array.isArray(application.approvalHistory) ? application.approvalHistory : [];
  const entry = [...history].reverse().find(item => item.role === role);
  if (!entry?.action) return 'Pending';
  return entry.action === 'Approved' ? '✅ Approved' : '❌ Rejected';
};

type DecisionEmailExtras = {
  yearAndSection?: string;
  mobileNumber?: string;
  institutionName?: string;
};

const buildDecisionMessage = (status: ApplicationStatus, application: Application, actor: User): string => {
  if (status === ApplicationStatus.APPROVED) {
    return `Congratulations! Your scholarship application "${application.scholarshipName}" has been approved by ${actor.name} (${actor.role}).`;
  }

  return `Your scholarship application "${application.scholarshipName}" was rejected by ${actor.name} (${actor.role}). Please contact your department office for clarification.`;
};

export const sendScholarshipDecisionEmail = async (
  studentEmail: string,
  studentName: string,
  application: Application,
  decisionStatus: ApplicationStatus,
  actor: User,
  extras: DecisionEmailExtras = {}
): Promise<void> => {
  if (!isDecisionStatus(decisionStatus)) return;
  if (!studentEmail?.trim()) return;
  const facultyStatus = getApprovalStatus(application, UserRole.TUTOR);
  const coordinatorStatus = getApprovalStatus(application, UserRole.COORDINATOR);
  const hodStatus = getApprovalStatus(application, UserRole.HOD);
  const yearAndSection = extras.yearAndSection || `Year N/A / Section ${application.section || 'N/A'}`;
  const mobileNumber = extras.mobileNumber || '';
  await sendScholarshipStatusEmail({
    toEmail: studentEmail,
    studentName,
    applicationStatus: decisionStatus,
    scholarshipName: application.scholarshipName,
    scholarship: application.scholarshipName,
    regNo: application.regNo,
    department: application.department,
    yearSection: yearAndSection,
    mobile: mobileNumber,
    facultyStatus,
    coordinatorStatus,
    hodStatus,
    finalStatus: decisionStatus === ApplicationStatus.APPROVED ? '✅ Approved' : '❌ Rejected',
    institutionName: extras.institutionName || INSTITUTION_NAME,
    reviewedBy: actor.name,
    reviewerRole: actor.role,
    decisionTime: new Date().toLocaleString(),
    message: buildDecisionMessage(decisionStatus, application, actor)
  });
};

export interface AdminDecisionEmailInput {
  toEmail: string;
  studentName: string;
  regNo?: string;
  department?: string;
  scholarshipName?: string;
  yearAndSection?: string;
  mobileNumber?: string;
  decisionStatus: ApplicationStatus;
  reviewedBy?: string;
  reviewerRole?: string;
  facultyStatus?: string;
  coordinatorStatus?: string;
  hodStatus?: string;
  finalStatus?: string;
  institutionName?: string;
}

const buildAdminDecisionMessage = (status: ApplicationStatus, scholarshipName: string, reviewer?: string): string => {
  const actionBy = reviewer ? ` by ${reviewer}` : '';
  if (status === ApplicationStatus.APPROVED) {
    return `Scholarship application "${scholarshipName}" was approved${actionBy}.`;
  }
  if (status === ApplicationStatus.REJECTED) {
    return `Scholarship application "${scholarshipName}" was rejected${actionBy}.`;
  }
  return `Scholarship application "${scholarshipName}" status updated to ${status}${actionBy}.`;
};

export const sendAdminDecisionEmail = async (input: AdminDecisionEmailInput): Promise<void> => {
  if (!input.toEmail?.trim()) return;
  if (!isDecisionStatus(input.decisionStatus)) return;

  await sendScholarshipStatusEmail({
    toEmail: input.toEmail,
    toName: 'Admin',
    adminEmail: input.toEmail,
    studentName: input.studentName || 'Student',
    applicationStatus: input.decisionStatus,
    scholarshipName: input.scholarshipName || '',
    scholarship: input.scholarshipName || '',
    regNo: input.regNo || '',
    department: input.department || '',
    yearSection: input.yearAndSection || '',
    mobile: input.mobileNumber || '',
    facultyStatus: input.facultyStatus || '',
    coordinatorStatus: input.coordinatorStatus || '',
    hodStatus: input.hodStatus || '',
    finalStatus: input.finalStatus || input.decisionStatus,
    institutionName: input.institutionName || INSTITUTION_NAME,
    reviewedBy: input.reviewedBy || '',
    reviewerRole: input.reviewerRole || '',
    decisionTime: new Date().toLocaleString(),
    message: buildAdminDecisionMessage(
      input.decisionStatus,
      input.scholarshipName || 'Scholarship',
      input.reviewedBy ? `${input.reviewedBy} (${input.reviewerRole || 'Staff'})` : ''
    )
  }, {
    templateId: emailJsConfig.adminTemplateId || emailJsConfig.templateId
  });
};
