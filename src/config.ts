const readEnv = (key: string): string => {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
  return (env[key] || '').trim();
};

export const firebaseConfig = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID')
};

export const firebaseFunctionsRegion = readEnv('VITE_FIREBASE_FUNCTIONS_REGION') || 'us-central1';

const ADMIN_ALERT_EMAILS = readEnv('VITE_ADMIN_ALERT_EMAILS');

export const emailJsConfig = {
  serviceId: readEnv('VITE_EMAILJS_SERVICE_ID'),
  templateId: readEnv('VITE_EMAILJS_TEMPLATE_ID') || 'template_257006',
  adminTemplateId: readEnv('VITE_EMAILJS_ADMIN_TEMPLATE_ID') || 'template_912006',
  publicKey: readEnv('VITE_EMAILJS_PUBLIC_KEY')
};

export const isEmailJsConfigured = (): boolean =>
  !!emailJsConfig.serviceId && !!emailJsConfig.templateId && !!emailJsConfig.publicKey;

export const isAdminEmailJsConfigured = (): boolean =>
  !!emailJsConfig.serviceId &&
  !!(emailJsConfig.adminTemplateId || emailJsConfig.templateId) &&
  !!emailJsConfig.publicKey;

export const adminAlertEmails: string[] = ADMIN_ALERT_EMAILS
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

const decisionEmailSender = readEnv('VITE_DECISION_EMAIL_SENDER').toLowerCase();
export const useClientDecisionEmail = decisionEmailSender !== 'function';
