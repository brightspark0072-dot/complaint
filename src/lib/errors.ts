// Maps backend errors to safe, user-facing text. Authentication messages are deliberately generic so they
// never reveal whether an email address has an account.

export const AUTH_MESSAGES = {
  signIn: 'Invalid email or password, or the email has not been confirmed yet.',
  signUp:
    'If this email can be registered, a confirmation message is on its way. Check your inbox to continue.',
  reset: 'If an account exists for that email, a password reset link has been sent.',
  generic: 'Something went wrong. Please try again.',
  rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
  weakPassword: 'Choose a stronger password (at least 10 characters, with letters and numbers).',
} as const;

interface ErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

function isRateLimited(e: ErrorLike): boolean {
  return (
    e.status === 429 ||
    e.code === 'over_request_rate_limit' ||
    e.code === 'over_email_send_rate_limit'
  );
}

export function signInErrorMessage(e: ErrorLike | null): string | undefined {
  if (!e) return undefined;
  return isRateLimited(e) ? AUTH_MESSAGES.rateLimited : AUTH_MESSAGES.signIn;
}

/** Returns an error ONLY for failures that do not disclose account existence. */
export function signUpErrorMessage(e: ErrorLike | null): string | undefined {
  if (!e) return undefined;
  if (isRateLimited(e)) return AUTH_MESSAGES.rateLimited;
  if (e.code === 'weak_password') return AUTH_MESSAGES.weakPassword;
  // "user_already_exists" and similar are intentionally swallowed: the caller shows the neutral message.
  return undefined;
}

export function resetErrorMessage(e: ErrorLike | null): string | undefined {
  if (!e) return undefined;
  return isRateLimited(e) ? AUTH_MESSAGES.rateLimited : undefined;
}

/** Postgres/RPC errors from our SECURITY DEFINER functions carry intentionally safe messages. */
export function actionErrorMessage(e: ErrorLike | null): string {
  if (!e) return AUTH_MESSAGES.generic;
  switch (e.code) {
    case '42501':
      return 'You are not allowed to do that.';
    case 'P0002':
      return 'That complaint could not be found.';
    case '53400':
      return 'You have reached a limit. Please try again later.';
    case '23514':
      return 'Some of the information is not valid. Please check the form.';
    case '22023':
      return e.message && e.message.length < 140 ? e.message : 'The request was not valid.';
    default:
      return AUTH_MESSAGES.generic;
  }
}
