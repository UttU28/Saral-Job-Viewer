import { useEffect, useState, type FormEvent } from "react";
import { BarChart3, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, PencilLine, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Footer } from "@/components/Footer";
import { useWeeklyReportQuery } from "@/hooks/use-jobs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatWeekRange(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "—";
  return `${startIso} to ${endIso}`;
}

function formatDateTime(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRelativeAge(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function Profile() {
  const { user, changePassword, updateUserName } = useAuth();
  const weeklyReportQuery = useWeeklyReportQuery();
  const summary = weeklyReportQuery.data?.summary;
  const rows = weeklyReportQuery.data?.weeks ?? [];
  const userInitials =
    (user?.name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U";
  const weekCount = rows.length; // retained usage in UI copy
  const [nameDraft, setNameDraft] = useState(user?.name ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileErrorText, setProfileErrorText] = useState("");
  const [profileSuccessText, setProfileSuccessText] = useState("");
  const [showPasswordCard, setShowPasswordCard] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordErrorText, setPasswordErrorText] = useState("");
  const [passwordSuccessText, setPasswordSuccessText] = useState("");

  useEffect(() => {
    setNameDraft(user?.name ?? "");
  }, [user?.name]);

  const onProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setProfileSubmitting(true);
    setProfileErrorText("");
    setProfileSuccessText("");
    try {
      await updateUserName(nameDraft);
      setProfileSuccessText("Profile updated.");
      setIsEditingName(false);
    } catch (error) {
      setProfileErrorText(error instanceof Error ? error.message : "Could not update profile.");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const onPasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmittingPassword(true);
    setPasswordErrorText("");
    setPasswordSuccessText("");
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccessText("Password updated successfully.");
      setShowPasswordCard(false);
    } catch (error) {
      setPasswordErrorText(error instanceof Error ? error.message : "Could not change password.");
    } finally {
      setSubmittingPassword(false);
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="min-h-full flex flex-col">
        <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 sm:space-y-6 min-w-0">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/50 to-emerald-500/[0.06] p-6 sm:p-7 shadow-sm shadow-primary/5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            <Avatar className="h-12 w-12 shrink-0">
              <AvatarImage src={user?.profilePhotoUrl} alt={user?.name || "User"} />
              <AvatarFallback className="font-semibold">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="space-y-3 min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your profile</p>
                  <h2 className="text-xl sm:text-2xl font-bold font-display text-foreground truncate">
                    {user?.name || "User"}
                  </h2>
                  <p className="text-sm text-muted-foreground break-all">{user?.email || "—"}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl h-10 gap-2"
                    onClick={() => {
                      setShowPasswordCard((prev) => !prev);
                      setPasswordErrorText("");
                      setPasswordSuccessText("");
                    }}
                  >
                    <KeyRound className="h-4 w-4" aria-hidden />
                    {showPasswordCard ? "Hide password" : "Change password"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-xl h-10 gap-2"
                    onClick={() => {
                      setIsEditingName((prev) => !prev);
                      setProfileErrorText("");
                      setProfileSuccessText("");
                    }}
                  >
                    <PencilLine className="h-4 w-4" aria-hidden />
                    {isEditingName ? "Close edit" : "Edit profile"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm">
                <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-2.5">
                  <span className="text-muted-foreground">Created:</span>{" "}
                  <span className="text-foreground/90 font-medium">{formatRelativeAge(user?.createdAt || "")}</span>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/55 px-3 py-2.5">
                  <span className="text-muted-foreground">Updated:</span>{" "}
                  <span className="text-foreground/90 font-medium">{formatRelativeAge(user?.updatedAt || "")}</span>
                </div>
              </div>

              {profileErrorText ? (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Profile update failed</AlertTitle>
                  <AlertDescription>{profileErrorText}</AlertDescription>
                </Alert>
              ) : null}
              {profileSuccessText ? (
                <Alert className="rounded-xl border-emerald-500/30 bg-emerald-500/[0.06]">
                  <AlertTitle className="text-emerald-700 dark:text-emerald-400">Done</AlertTitle>
                  <AlertDescription>{profileSuccessText}</AlertDescription>
                </Alert>
              ) : null}

              {isEditingName ? (
                <form onSubmit={onProfileSubmit} className="flex flex-col sm:flex-row gap-2.5 sm:items-end">
                  <div className="space-y-1.5 flex-1">
                    <Label htmlFor="profile-name">Display name</Label>
                    <Input
                      id="profile-name"
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      required
                      className="h-11 rounded-xl bg-background/80 border-border"
                    />
                  </div>
                  <div className="flex gap-2 sm:pb-0.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl h-11"
                      onClick={() => {
                        setNameDraft(user?.name ?? "");
                        setIsEditingName(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-xl h-11 gap-2"
                      disabled={profileSubmitting}
                    >
                      {profileSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      Save
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </div>

        {showPasswordCard ? (
        <div className="rounded-2xl border border-border bg-card/50 dark:bg-card/40 p-6 sm:p-8 shadow-sm">
          <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] items-start">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Security</p>
                <h2 className="text-xl sm:text-2xl font-bold font-display text-foreground inline-flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" aria-hidden />
                  Change password
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  This password is for your Saral Job Viewer account. Use a strong password you can remember.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 pt-0.5">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] dark:bg-emerald-950/20 px-3.5 py-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  <span className="inline-flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      Updates the Saral account password in the database; your Midhtech website password is separate.
                    </span>
                  </span>
                </div>
                <div className="rounded-xl border border-primary/25 bg-primary/[0.06] dark:bg-primary/10 px-3.5 py-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  <span className="inline-flex items-start gap-2">
                    <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />
                    <span>
                      After updating, use the <strong className="text-foreground/90">new password</strong> at next sign in.
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {passwordErrorText ? (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Password update failed</AlertTitle>
                  <AlertDescription>{passwordErrorText}</AlertDescription>
                </Alert>
              ) : null}
              {passwordSuccessText ? (
                <Alert className="rounded-xl border-emerald-500/30 bg-emerald-500/[0.06]">
                  <AlertTitle className="text-emerald-700 dark:text-emerald-400">Done</AlertTitle>
                  <AlertDescription>{passwordSuccessText}</AlertDescription>
                </Alert>
              ) : null}

              <form onSubmit={onPasswordSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="profile-current-password">Current password</Label>
                  <div className="relative">
                    <Input
                      id="profile-current-password"
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
                  <Label htmlFor="profile-new-password">New password</Label>
                  <div className="relative">
                    <Input
                      id="profile-new-password"
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

                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl h-11 w-full sm:w-auto"
                    onClick={() => {
                      setShowPasswordCard(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setPasswordErrorText("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-xl gap-2 h-11 w-full sm:w-auto min-w-[10rem] touch-manipulation"
                    disabled={submittingPassword}
                  >
                    {submittingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <KeyRound className="h-4 w-4" aria-hidden />
                    )}
                    Update password
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-card/50 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground inline-flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" aria-hidden />
                Weekly Decision Report
              </h1>
              <p className="text-sm text-muted-foreground">
                Monday to Sunday counts for accepted and rejected actions. Every action click is timestamped and tracked.
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
              <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Accepted</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{summary?.acceptedCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3">
              <p className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">Rejected</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{summary?.rejectedCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary/[0.08] p-3">
              <p className="text-xs uppercase tracking-wider text-primary">Total Actions</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{summary?.totalCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
          {weeklyReportQuery.isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading weekly report...
            </div>
          ) : weeklyReportQuery.isError ? (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-destructive text-sm">
              Could not load weekly report.
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-border/70 p-6 text-sm text-muted-foreground">
              No weekly stats yet. Accept or reject a few jobs and this report will populate.
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto scrollbar-themed rounded-lg border border-border/50">
              <Table className="min-w-[640px] w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead className="text-emerald-700 dark:text-emerald-300">Accepted</TableHead>
                  <TableHead className="text-rose-700 dark:text-rose-300">Rejected</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Latest Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.weekKey}>
                    <TableCell className="font-medium">{row.weekKey}</TableCell>
                    <TableCell>{formatWeekRange(row.weekStartIso, row.weekEndIso)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {row.acceptedCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-rose-500" />
                        {row.rejectedCount}
                      </span>
                    </TableCell>
                    <TableCell>{row.totalCount}</TableCell>
                    <TableCell className="text-muted-foreground text-xs sm:text-sm">
                      {row.updatedAt || row.createdAt || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </div>

        </div>
        <Footer />
        </div>
      </div>
    </div>
  );
}
