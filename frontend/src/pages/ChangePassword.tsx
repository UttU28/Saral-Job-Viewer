import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Footer } from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePassword() {
  const { changePassword, user } = useAuth();
  const [, navigate] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorText("");
    setSuccessText("");
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setSuccessText("Password updated successfully.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Could not change password.");
    } finally {
      setSubmitting(false);
    }
  };

  const firstName = (user?.name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="min-h-full flex flex-col">
        <div className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 min-w-0">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/50 to-emerald-500/[0.06] p-6 sm:p-7 shadow-sm shadow-primary/5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 border border-primary/25">
              <KeyRound className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Security</p>
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">
                Hi {firstName}, update your password
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This password is stored for your{" "}
                <strong className="text-foreground font-medium">Saral Job Viewer</strong> account. Use something strong—you’ll
                use it to sign in and to unlock saved Midhtech credentials when you accept jobs.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] dark:bg-emerald-950/20 px-3.5 py-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  <span className="inline-flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      Changing here updates the <strong className="text-foreground/90">database only</strong>; your Midhtech
                      site password stays separate unless you choose the same value.
                    </span>
                  </span>
                </div>
                <div className="rounded-xl border border-primary/25 bg-primary/[0.06] dark:bg-primary/10 px-3.5 py-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  <span className="inline-flex items-start gap-2">
                    <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
                    <span>
                      After a successful change, use the <strong className="text-foreground/90">new password</strong> the
                      next time you log in.
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/50 dark:bg-card/40 p-6 sm:p-8 shadow-sm">
          <div className="space-y-1 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold font-display text-foreground">New credentials</h2>
            <p className="text-sm text-muted-foreground">Enter your current password once, then choose a new one.</p>
          </div>

          {errorText ? (
            <Alert variant="destructive" className="mb-4 rounded-xl">
              <AlertTitle>Password update failed</AlertTitle>
              <AlertDescription>{errorText}</AlertDescription>
            </Alert>
          ) : null}
          {successText ? (
            <Alert className="mb-4 rounded-xl border-emerald-500/30 bg-emerald-500/[0.06]">
              <AlertTitle className="text-emerald-700 dark:text-emerald-400">Done</AlertTitle>
              <AlertDescription>{successText}</AlertDescription>
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-5 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={currentPasswordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  className="h-11 rounded-xl bg-background/80 border-border pr-11 text-base sm:text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setCurrentPasswordVisible((value) => !value)}
                  aria-label={currentPasswordVisible ? "Hide current password" : "Show current password"}
                  aria-pressed={currentPasswordVisible}
                >
                  {currentPasswordVisible ? (
                    <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={newPasswordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  className="h-11 rounded-xl bg-background/80 border-border pr-11 text-base sm:text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setNewPasswordVisible((value) => !value)}
                  aria-label={newPasswordVisible ? "Hide new password" : "Show new password"}
                  aria-pressed={newPasswordVisible}
                >
                  {newPasswordVisible ? (
                    <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Eye className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                type="submit"
                className="rounded-xl gap-2 h-11 w-full sm:w-auto min-w-[10rem] touch-manipulation"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden />
                )}
                Update password
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl h-11 w-full sm:w-auto touch-manipulation"
                onClick={() => navigate("/")}
              >
                Back
              </Button>
            </div>
          </form>
        </div>
        </div>
        <Footer />
        </div>
      </div>
    </div>
  );
}
