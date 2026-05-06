import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ChangePassword() {
  const { changePassword } = useAuth();
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

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/45 p-6 sm:p-8 shadow-xl shadow-black/15">
        <div className="space-y-2 mb-6">
          <h1 className="text-2xl font-bold font-display text-foreground">Change Password</h1>
          <p className="text-sm text-muted-foreground">
            Update your account password stored in the database.
          </p>
        </div>

        {errorText ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Password update failed</AlertTitle>
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        ) : null}
        {successText ? (
          <Alert className="mb-4 border-emerald-500/30 bg-emerald-500/[0.06]">
            <AlertTitle className="text-emerald-700 dark:text-emerald-400">Done</AlertTitle>
            <AlertDescription>{successText}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
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
                className="pr-11"
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
                className="pr-11"
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
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="rounded-xl gap-2" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Update password
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate("/")}>
              Back
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
