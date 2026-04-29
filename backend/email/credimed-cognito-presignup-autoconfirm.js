/**
 * credimed-cognito-presignup-autoconfirm (Lambda)
 *
 * Cognito User Pool — Pre Sign-Up trigger. Fires for every signup
 * attempt before the user is created. Auto-confirms the user AND
 * marks their email as verified, so the patient never sees a
 * "Verify your email" code screen.
 *
 * Why both flags matter (the current bug we're fixing):
 *   - autoConfirmUser = true   → user can sign in immediately
 *   - autoVerifyEmail = true   → user can RESET their password later
 *                                (Cognito refuses to send a reset
 *                                code unless the email is verified)
 *
 * If only the first flag is set, users who forget their password
 * hit the dead-end error: "Cannot reset password for the user as
 * there is no registered/verified email or phone_number." The
 * second flag prevents that.
 *
 * No env vars or IAM beyond the default Lambda execution role.
 *
 * Cognito wiring (one-time, in Cognito console):
 *   User pool > User pool properties > Lambda triggers > Pre sign-up
 *   > select this Lambda > Save.
 */

export const handler = async (event) => {
  /* Auto-confirm the user. They skip the "Enter verification code"
     screen and can sign in immediately after submitting the signup
     form. Reduces friction by ~30 seconds and ~1 email round-trip. */
  event.response.autoConfirmUser = true;

  /* Mark the email attribute as verified. This is what Cognito
     checks when a user requests a password reset — without it, the
     reset request 400s with "no registered/verified email" and the
     user is stranded. */
  event.response.autoVerifyEmail = true;

  /* Phone is optional in our signup form; only mark it verified if
     it was actually provided. Leaving it false otherwise is fine —
     we don't use phone for password reset, only email. */
  if (event.request.userAttributes.phone_number) {
    event.response.autoVerifyPhone = true;
  }

  return event;
};
