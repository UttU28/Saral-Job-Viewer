import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText("");
    try {
      await login(email.trim(), password);
      navigate("/");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/45 p-6 sm:p-8 shadow-xl shadow-black/15">
        <div className="space-y-2 mb-6">
          <h1 className="text-2xl font-bold font-display text-foreground">Login</h1>
          <p className="text-sm text-muted-foreground">
            Use the same email and password that you configured for Midhtech.com in this tool.
          </p>
        </div>

        {errorText ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Could not sign in</AlertTitle>
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                required
                className="pr-11"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setPasswordVisible((value) => !value)}
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                aria-pressed={passwordVisible}
              >
                {passwordVisible ? (
                  <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4 shrink-0" aria-hidden />
                )}
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full rounded-xl gap-2" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="h-4 w-4" />}
            Sign in
          </Button>
        </form>

        <p className="mt-5 text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
