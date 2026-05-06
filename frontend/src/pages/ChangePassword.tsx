import { useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ExternalLink, Eye, EyeOff, Github, Heart, KeyRound, Loader2, Youtube } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const DEV_YOUTUBE = "https://www.youtube.com/@ThatInsaneGuy/";
const DEV_GITHUB_PROFILE = "https://github.com/UttU28/";
const PROJECT_REPO = "https://github.com/UttU28/Saral-Job-Viewer";

function FooterExternalLink({
  href,
  children,
  className,
}: Readonly<{
  href: string;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "group inline-flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary",
        className,
      )}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
    </a>
  );
}

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto scrollbar-themed">
      <div className="w-full max-w-3xl mx-auto flex-1 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-8">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/45 p-6 sm:p-8 shadow-xl shadow-black/15 mx-auto">
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

      <footer
        className="shrink-0 border-t border-border bg-muted/30 dark:bg-muted/20"
        aria-label="Site footer and credits"
      >
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="grid gap-8 sm:grid-cols-2 sm:gap-10 lg:gap-12">
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Developer
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
                  <Heart className="h-3.5 w-3.5 text-primary shrink-0 fill-primary/25" aria-hidden />
                  Made with keyboard and mouse by ThatInsaneGuy
                </span>
              </p>
              <div className="flex flex-col gap-2.5 sm:max-w-xs">
                <FooterExternalLink href={DEV_YOUTUBE}>
                  <Youtube className="h-4 w-4 shrink-0 text-red-500/90" aria-hidden />
                  YouTube
                </FooterExternalLink>
                <FooterExternalLink href={DEV_GITHUB_PROFILE}>
                  <Github className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  GitHub · UttU28
                </FooterExternalLink>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Open source
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Like what you see? Clone or fork{" "}
                <strong className="text-foreground font-medium">Saral Job Viewer</strong> and run it locally.
              </p>
              <FooterExternalLink href={PROJECT_REPO} className="w-full sm:w-max font-mono text-xs sm:text-sm">
                <Github className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                UttU28/Saral-Job-Viewer
              </FooterExternalLink>
            </div>
          </div>

          <div className="mt-8 sm:mt-10 pt-6 border-t border-border/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/90">Saral Job Viewer</span>
              <span className="mx-1.5 text-border">·</span>
              Not affiliated with job platforms
            </p>
            <p className="text-xs text-muted-foreground">Thanks for using this tool</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
