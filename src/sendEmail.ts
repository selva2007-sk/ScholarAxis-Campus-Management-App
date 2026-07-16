import emailjs from '@emailjs/browser';
import { emailJsConfig } from './config';

export interface ScholarshipStatusEmailInput {
  toEmail: string;
  toName?: string;
  adminEmail?: string;
  studentName: string;
  applicationStatus: string;
  scholarshipName?: string;
  scholarship?: string;
  reviewedBy?: string;
  reviewerRole?: string;
  decisionTime?: string;
  message?: string;
  regNo?: string;
  department?: string;
  yearSection?: string;
  mobile?: string;
  facultyStatus?: string;
  coordinatorStatus?: string;
  hodStatus?: string;
  finalStatus?: string;
  institutionName?: string;
}

export interface EmailJsConfig {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
}

export async function sendScholarshipStatusEmail(
  input: ScholarshipStatusEmailInput,
  config: EmailJsConfig = {}
): Promise<void> {
  const serviceId = (config.serviceId ?? emailJsConfig.serviceId ?? '').trim();
  const templateId = (config.templateId ?? emailJsConfig.templateId ?? '').trim();
  const publicKey = (config.publicKey ?? emailJsConfig.publicKey ?? '').trim();

  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS config missing: serviceId/templateId/publicKey');
  }

  if (!input.toEmail || !input.studentName || !input.applicationStatus) {
    throw new Error('Missing required email input fields');
  }

  try {
    await emailjs.send(
      serviceId,
      templateId,
      {
        to_email: input.toEmail,
        to_name: input.toName || input.studentName || '',
        admin_email: input.adminEmail || input.toEmail,
        student_name: input.studentName,
        application_status: input.applicationStatus,
        status: input.applicationStatus,
        scholarship_name: input.scholarshipName || '',
        scholarship: input.scholarship || input.scholarshipName || '',
        reg_no: input.regNo || '',
        department: input.department || '',
        year_section: input.yearSection || '',
        mobile: input.mobile || '',
        faculty_status: input.facultyStatus || '',
        coordinator_status: input.coordinatorStatus || '',
        hod_status: input.hodStatus || '',
        final_status: input.finalStatus || input.applicationStatus,
        institution_name: input.institutionName || '',
        reviewed_by: input.reviewedBy || '',
        reviewer_role: input.reviewerRole || '',
        decision_time: input.decisionTime || '',
        message: input.message || ''
      },
      { publicKey }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown EmailJS error';
    throw new Error(`Failed to send scholarship status email: ${message}`);
  }
}
