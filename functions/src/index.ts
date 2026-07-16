import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import nodemailer from 'nodemailer';

initializeApp();
const adminDb = getFirestore();

type DecisionStatus = 'Approved' | 'Rejected';
type NotificationRoute = {
  screen?: string;
  applicationId?: string;
  scholarshipId?: string;
};

type ApplicationDoc = {
  studentId?: string;
  studentName?: string;
  scholarshipName?: string;
  status?: string;
  emailNotification?: {
    lastNotifiedStatus?: string;
  };
};

type NotificationDoc = {
  userId?: string;
  title?: string;
  message?: string;
  timestamp?: number;
  route?: NotificationRoute;
};

const gmailUser = defineSecret('GMAIL_USER');
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');
const DEFAULT_ANDROID_CHANNEL_ID = 'scholaraxis_updates';

const isDecisionStatus = (status: string | undefined): status is DecisionStatus =>
  status === 'Approved' || status === 'Rejected';

const buildEmailTemplate = (studentName: string, scholarshipName: string, status: DecisionStatus): string => {
  if (status === 'Approved') {
    return `
      <p>Dear ${studentName},</p>
      <p>Your scholarship application for <strong>${scholarshipName}</strong> has been <strong style="color: #166534;">APPROVED</strong>.</p>
      <p>Regards,<br/>ScholarAxis Team</p>
    `;
  }

  return `
    <p>Dear ${studentName},</p>
    <p>Your scholarship application for <strong>${scholarshipName}</strong> has been <strong style="color: #b91c1c;">REJECTED</strong>.</p>
    <p>Please contact your department office for clarification.</p>
    <p>Regards,<br/>ScholarAxis Team</p>
  `;
};

export const notifyScholarshipDecision = onDocumentUpdated(
  {
    document: 'applications/{applicationId}',
    region: 'us-central1',
    secrets: [gmailUser, gmailAppPassword]
  },
  async event => {
    const before = event.data?.before.data() as ApplicationDoc | undefined;
    const after = event.data?.after.data() as ApplicationDoc | undefined;
    const applicationId = event.params.applicationId;

    if (!before || !after) return;
    if (before.status === after.status) return;
    if (!isDecisionStatus(after.status)) return;

    if (after.emailNotification?.lastNotifiedStatus === after.status) {
      return;
    }

    if (!after.studentId) {
      logger.error('Missing studentId on application', { applicationId });
      return;
    }

    const studentSnapshot = await adminDb.doc(`users/${after.studentId}`).get();
    const student = studentSnapshot.data() as { email?: string; name?: string } | undefined;
    const studentEmail = student?.email;

    if (!studentEmail) {
      logger.error('Student email not found for application', { applicationId, studentId: after.studentId });
      return;
    }

    const studentName = after.studentName || student?.name || 'Student';
    const scholarshipName = after.scholarshipName || 'Scholarship';

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser.value(),
        pass: gmailAppPassword.value()
      }
    });

    const subject =
      after.status === 'Approved'
        ? `Scholarship Approved: ${scholarshipName}`
        : `Scholarship Rejected: ${scholarshipName}`;

    try {
      const result = await transporter.sendMail({
        from: `"ScholarAxis" <${gmailUser.value()}>`,
        to: studentEmail,
        subject,
        html: buildEmailTemplate(studentName, scholarshipName, after.status)
      });

      await adminDb.doc(`applications/${applicationId}`).set(
        {
          emailNotification: {
            lastNotifiedStatus: after.status,
            lastNotifiedAt: FieldValue.serverTimestamp(),
            lastMessageId: result.messageId
          }
        },
        { merge: true }
      );
    } catch (error) {
      logger.error('Failed to send scholarship decision email', { applicationId, error });

      await adminDb.doc(`applications/${applicationId}`).set(
        {
          emailNotification: {
            lastError: String(error),
            lastErrorAt: FieldValue.serverTimestamp()
          }
        },
        { merge: true }
      );
    }
  }
);

export const sendPushNotificationForNewAlert = onDocumentCreated(
  {
    document: 'notifications/{notificationId}',
    region: 'us-central1'
  },
  async event => {
    const snapshot = event.data;
    if (!snapshot) return;

    const notification = snapshot.data() as NotificationDoc | undefined;
    if (!notification?.userId) return;

    try {
      const tokensSnapshot = await adminDb
        .collection(`users/${notification.userId}/deviceTokens`)
        .get();
      const tokens = tokensSnapshot.docs.map(docSnap => docSnap.id).filter(Boolean);

      if (tokens.length === 0) {
        logger.info('No device tokens available for push notification', {
          userId: notification.userId,
          notificationId: event.params.notificationId
        });
        return;
      }

      const data: Record<string, string> = {
        userId: notification.userId,
        notificationId: event.params.notificationId
      };

      if (notification.route?.screen) data.screen = notification.route.screen;
      if (notification.route?.applicationId) data.applicationId = notification.route.applicationId;
      if (notification.route?.scholarshipId) data.scholarshipId = notification.route.scholarshipId;

      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: {
          title: notification.title || 'ScholarAxis',
          body: notification.message || ''
        },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: DEFAULT_ANDROID_CHANNEL_ID,
            sound: 'default',
            defaultSound: true,
            defaultVibrateTimings: true
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default'
            }
          }
        }
      });

      const invalidTokens: string[] = [];
      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          const code = resp.error?.code || '';
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(tokens[index]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        const batch = adminDb.batch();
        invalidTokens.forEach(token =>
          batch.delete(adminDb.doc(`users/${notification.userId}/deviceTokens/${token}`))
        );
        await batch.commit();
      }
    } catch (error) {
      logger.error('Failed to send push notification', {
        notificationId: event.params.notificationId,
        userId: notification.userId,
        error
      });
    }
  }
);
