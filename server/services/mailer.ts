/** @format */

import nodemailer, { Transporter } from "nodemailer";

// Brevo SMTP configuration
const transporter: Transporter = nodemailer.createTransport({
	host: "smtp-relay.brevo.com",
	port: 587,
	secure: false,
	auth: {
		user: process.env.BREVO_EMAIL_ADDRESS,
		pass: process.env.BREVO_EMAIL_PASSWORD,
	},
});

export async function sendVerificationEmail(to: string, code: string, verificationId: string) {
	try {
		const mailOptions = {
			from: '"DOPE Network" <noreply@dopp.eu.org>',
			to: to,
			subject: "Verify Your Email Address - DOPE Network",
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
					<h2 style="color: #333; text-align: center;">Welcome to DOPE Network!</h2>
					<p style="color: #666; font-size: 16px;">
						Thank you for registering with DOPE Network. Please verify your email address to complete your registration.
					</p>
					<div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
						<p style="color: #333; font-size: 18px; margin-bottom: 10px;">Your verification code is:</p>
						<h1 style="color: #007bff; font-size: 32px; letter-spacing: 4px; margin: 0;">${code}</h1>
					</div>
					<p style="color: #666; font-size: 14px;">
						This code will expire in 15 minutes. If you didn't request this verification, please ignore this email.
					</p>
					<p style="color: #666; font-size: 14px;">
						Verification Link: <a href="https://mine.dopp.eu.org/login/verify/${verificationId}?code=${code}">https://mine.dopp.eu.org/login/verify/${verificationId}?code=${code}</a>
					</p>
					<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
					<p style="color: #999; font-size: 12px; text-align: center;">
						© 2025 DOPE Network. All rights reserved.
					</p>
				</div>
			`,
			text: `
				Welcome to DOPE Network!

				Thank you for registering with DOPE Network. Please verify your email address to complete your registration.

				Your verification code is: ${code}

				This code will expire in 15 minutes. If you didn't request this verification, please ignore this email.

				Verification Link: https://mine.dopp.eu.org/login/verify/${verificationId}?code=${code}
			`,
		};

		const info = await transporter.sendMail(mailOptions);
		console.log(`[MAILER] Email sent successfully to ${to}. Message ID: ${info.messageId}`);
		return info;
	} catch (error) {
		console.error(`[MAILER] Failed to send email to ${to}:`, error);
		throw error;
	}
}

export async function sendPasswordResetEmail(to: string, code: string, resetId: string) {
	try {
		const mailOptions = {
			from: '"DOPE Network" <noreply@dopp.eu.org>',
			to: to,
			subject: "Password Reset Request - DOPE Network",
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
					<h2 style="color: #333; text-align: center;">Password Reset Request</h2>
					<p style="color: #666; font-size: 16px;">
						You have requested to reset your password for your DOPE Network account.
					</p>
					<div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
						<p style="color: #333; font-size: 18px; margin-bottom: 10px;">Your password reset code is:</p>
						<h1 style="color: #007bff; font-size: 32px; letter-spacing: 4px; margin: 0;">${code}</h1>
					</div>
					<p style="color: #666; font-size: 14px;">
						This code will expire in 15 minutes. If you didn't request this password reset, please ignore this email.
					</p>
					<p style="color: #666; font-size: 14px;">
						Reset Link: <a href="https://mine.dopp.eu.org/auth/reset/${resetId}?code=${code}">https://mine.dopp.eu.org/login/reset/${resetId}?code=${code}</a>
					</p>
					<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
					<p style="color: #999; font-size: 12px; text-align: center;">
						© 2025 DOPE Network. All rights reserved.
					</p>
				</div>
			`,
			text: `
				Password Reset Request - DOPE Network

				You have requested to reset your password for your DOPE Network account.

				Your password reset code is: ${code}

				This code will expire in 15 minutes. If you didn't request this password reset, please ignore this email.

				Reset Link: https://mine.dopp.eu.org/auth/reset/${resetId}?code=${code}
			`,
		};

		const info = await transporter.sendMail(mailOptions);
		console.log(`[MAILER] Password reset email sent successfully to ${to}. Message ID: ${info.messageId}`);
		return info;
	} catch (error) {
		console.error(`[MAILER] Failed to send password reset email to ${to}:`, error);
		throw error;
	}
}

export async function sendBillingReminderEmail(
	to: string, 
	userName: string, 
	subscription: string, 
	billingDate: string
) {
	try {
		const subscriptionDisplayName = subscription === 'premium' ? 'Premium' : 'Pro';

		const mailOptions = {
			from: '"DOPE Network" <noreply@dopp.eu.org>',
			to: to,
			subject: `Billing Reminder - Your ${subscriptionDisplayName} Subscription`,
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
					<h2 style="color: #333; text-align: center;">Billing Reminder - DOPE Network</h2>
					<p style="color: #666; font-size: 16px;">
						Hello ${userName},
					</p>
					<p style="color: #666; font-size: 16px;">
						This is a friendly reminder that your <strong>${subscriptionDisplayName}</strong> subscription will be renewed on <strong>${billingDate}</strong>.
					</p>
					<div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
						<p style="color: #333; font-size: 16px; margin: 0;">
							<strong>Subscription:</strong> ${subscriptionDisplayName}<br>
							<strong>Next Billing Date:</strong> ${billingDate}
						</p>
					</div>
					<p style="color: #666; font-size: 16px;">
						Your subscription will automatically renew unless you cancel it before the billing date. You can manage your subscription settings in your account dashboard.
					</p>
					<div style="text-align: center; margin: 30px 0;">
						<a href="https://www.dopp.eu.org/subscription" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
							Manage Subscription
						</a>
					</div>
					<p style="color: #666; font-size: 14px;">
						If you have any questions about your subscription or billing, please contact our support team.
					</p>
					<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
					<p style="color: #999; font-size: 12px; text-align: center;">
						© 2025 DOPE Network. All rights reserved.
					</p>
				</div>
			`,
			text: `
				Billing Reminder - DOPE Network

				Hello ${userName},

				This is a friendly reminder that your ${subscriptionDisplayName} subscription will be renewed on ${billingDate}.

				Subscription: ${subscriptionDisplayName}
				Next Billing Date: ${billingDate}

				Your subscription will automatically renew unless you cancel it before the billing date. You can manage your subscription settings in your account dashboard.

				Manage your subscription: https://www.dopp.eu.org/subscription

				If you have any questions about your subscription or billing, please contact our support team.
			`,
		};

		const info = await transporter.sendMail(mailOptions);
		console.log(`[MAILER] Billing reminder email sent successfully to ${to}. Message ID: ${info.messageId}`);
		return info;
	} catch (error) {
		console.error(`[MAILER] Failed to send billing reminder email to ${to}:`, error);
		throw error;
	}
}

export const sendTwoFactorEmail = async (
  email: string,
  code: string,
): Promise<void> => {

  const mailOptions = {
    from: '"DOPE Network" <no-reply@dopp.eu.org>',
    to: email,
    subject: "Your Two-Factor Authentication Code",
    html: `
      <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <h2 style="color: #333;">Two-Factor Authentication Code</h2>
        <p>Your 2FA verification code is:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${code}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please secure your account immediately.</p>
        <hr style="margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">
          This is an automated message from DOPE. Please do not reply to this email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export async function sendNotificationEmail(
  to: string,
  subject: string,
  title: string,
  message: string,
  actionUrl: string,
  actorInfo?: any
) {
  try {
    const actorImage = actorInfo?.photoURL ? 
      `<img src="${actorInfo.photoURL}" alt="${actorInfo.name || actorInfo.username}" style="width: 50px; height: 50px; border-radius: 50%; margin-right: 15px;">` :
      `<div style="width: 50px; height: 50px; border-radius: 50%; background-color: #007bff; color: white; display: flex; align-items: center; justify-content: center; margin-right: 15px; font-weight: bold; font-size: 18px;">${(actorInfo?.name || actorInfo?.username || 'U').charAt(0).toUpperCase()}</div>`;

    const mailOptions = {
      from: '"DOPE Network" <noreply@dopp.eu.org>',
      to: to,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; text-align: center;">${title}</h2>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              ${actorImage}
              <div>
                <p style="margin: 0; color: #333; font-size: 16px;">
                  ${message}
                </p>
              </div>
            </div>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${actionUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View on DOPE
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            You received this notification because you have email notifications enabled in your settings. You can manage your notification preferences in your account settings.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            © 2025 DOPE Network. All rights reserved.
          </p>
        </div>
      `,
      text: `
        ${title}

        ${message}

        View on DOPE: ${actionUrl}

        You received this notification because you have email notifications enabled in your settings. You can manage your notification preferences in your account settings.
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[MAILER] Notification email sent successfully to ${to}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`[MAILER] Failed to send notification email to ${to}:`, error);
    throw error;
  }
}