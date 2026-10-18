import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { resolveRedirect } from "./redirect";
import { sessionQueryKey } from "./session-query";
import { SignInError, signInWithEmail } from "./sign-in";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FAILURE_MESSAGES = {
  "invalid-credentials": "Invalid email or password",
  "rate-limited": "Too many sign-in attempts. Please wait a minute and try again.",
  network: "Can't reach the server. Check your connection and try again.",
} as const;

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

interface LoginFormProps {
  /** Raw `redirect` search param; only same-origin relative paths are followed. */
  redirect?: string;
}

/** Email and password sign-in card (FSD 6.2). */
export function LoginForm({ redirect }: LoginFormProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const signIn = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signInWithEmail(email.trim(), password),
    onSuccess: async () => {
      // Drop the cached "signed out" session so guards re-read it.
      queryClient.removeQueries({ queryKey: sessionQueryKey });
      router.history.push(resolveRedirect(redirect));
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const errors = validate(email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    signIn.mutate({ email, password });
  }

  const failure =
    signIn.error instanceof SignInError ? FAILURE_MESSAGES[signIn.error.kind] : null;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">CMF Design Assistant</CardTitle>
        <CardDescription>Sign in to continue to your design projects.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            {/* Live region stays mounted so the Alert (role="alert") inside it announces reliably. */}
            <div aria-live="assertive">
              {failure && (
                <Alert variant="destructive">
                  <AlertDescription>{failure}</AlertDescription>
                </Alert>
              )}
            </div>

            <Field data-invalid={fieldErrors.email ? true : undefined}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
              />
              {fieldErrors.email && <FieldError id="email-error">{fieldErrors.email}</FieldError>}
            </Field>

            <Field data-invalid={fieldErrors.password ? true : undefined}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
              />
              {fieldErrors.password && (
                <FieldError id="password-error">{fieldErrors.password}</FieldError>
              )}
            </Field>

            <Button type="submit" disabled={signIn.isPending}>
              {signIn.isPending ? "Signing in…" : "Sign in"}
            </Button>

            {import.meta.env.DEV && (
              <p className="text-center text-xs text-muted-foreground">
                Dev seed user: test@lmesh.eu / password
              </p>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
