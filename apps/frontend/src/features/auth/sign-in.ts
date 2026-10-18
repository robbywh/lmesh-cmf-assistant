import { authClient } from "./auth-client";

export type SignInFailure = "invalid-credentials" | "rate-limited" | "network";

/** Failure of the sign-in call, classified for the form's alert. */
export class SignInError extends Error {
  readonly kind: SignInFailure;

  constructor(kind: SignInFailure) {
    super(kind);
    this.name = "SignInError";
    this.kind = kind;
  }
}

function classify(status: number, code: string | undefined): SignInFailure {
  if (status === 429) return "rate-limited";
  if (status === 401 || code === "INVALID_EMAIL_OR_PASSWORD") return "invalid-credentials";
  return "network";
}

/**
 * Signs in with email and password.
 * @throws SignInError for wrong credentials (any 401), rate limiting (429) and network or server failures.
 */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  try {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new SignInError(classify(error.status, error.code));
  } catch (cause) {
    throw cause instanceof SignInError ? cause : new SignInError("network");
  }
}
