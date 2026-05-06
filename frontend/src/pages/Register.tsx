import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Eye, EyeOff, Loader2, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { formatClientError } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
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
      await register(name.trim(), email.trim(), password);
      toast({
        title: "Account created",
        description: "You are now signed in.",
      });
      navigate("/");
    } catch (error) {
      const message = formatClientError(error, "Registration failed.");
      setErrorText(message);
      toast({
        variant: "destructive",
        title: "Could not create account",
        description: message.length > 280 ? `${message.slice(0, 280)}…` : message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_42%)]"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-card/65 backdrop-blur-md p-6 sm:p-8 shadow-xl shadow-black/20">
        <div className="space-y-3 mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Saral Job Viewer
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Secure account setup
          </div>
          <h1 className="text-2xl font-bold font-display text-foreground">Register</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Use the same <strong className="text-foreground font-medium">Midhtech email and password</strong> here.
            You will use these credentials later to log in and submit jobs.
          </p>
        </div>

        {errorText ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Could not create account</AlertTitle>
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="register-name">Name</Label>
            <Input
              id="register-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
              required
              className="rounded-xl bg-background/70 border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              className="rounded-xl bg-background/70 border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <div className="relative">
              <Input
                id="register-password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a password"
                required
                className="rounded-xl bg-background/70 border-border pr-11"
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
          <Button
            type="submit"
            className="w-full rounded-xl gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Create account
          </Button>
        </form>

        <p className="mt-5 text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
