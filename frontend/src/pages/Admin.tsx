import { useState } from "react";
import { Loader2, Shield, ShieldCheck, ShieldX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { Footer } from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { setUserAdminStatus } from "@/lib/api";
import { formatClientError } from "@/lib/api";
import { useAdminUsersQuery } from "@/hooks/use-jobs";
import { toast } from "@/hooks/use-toast";

export default function Admin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const adminUsersQuery = useAdminUsersQuery(Boolean(user?.isAdmin));
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  if (!user?.isAdmin) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
          <div className="min-h-full flex flex-col">
            <div className="flex-1 w-full max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 min-w-0">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Admin access required</AlertTitle>
                <AlertDescription>
                  This page is only visible to users with admin access.
                </AlertDescription>
              </Alert>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  const users = adminUsersQuery.data?.users ?? [];
  const summary = adminUsersQuery.data?.summary;

  const onToggleAdmin = async (targetUserId: string, nextIsAdmin: boolean) => {
    setUpdatingUserId(targetUserId);
    try {
      await setUserAdminStatus(targetUserId, nextIsAdmin);
      await queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast({
        title: nextIsAdmin ? "Admin access granted" : "Admin access removed",
        description: targetUserId,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update admin access",
        description: formatClientError(error, "Request failed"),
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="min-h-full flex flex-col">
          <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 sm:space-y-6 min-w-0">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/50 to-emerald-500/[0.06] p-6 sm:p-7 shadow-sm shadow-primary/5">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 border border-primary/25">
                  <Shield className="h-6 w-6 text-primary" aria-hidden />
                </div>
                <div className="space-y-2 min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Admin</p>
                  <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">Admin dashboard</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    View all users, review counts, and manage admin access from one place.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-primary/25 bg-primary/[0.08] p-3">
                  <p className="text-xs uppercase tracking-wider text-primary">Total users</p>
                  <p className="text-2xl font-semibold text-foreground mt-1">{summary?.totalUsers ?? 0}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
                  <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Admin users
                  </p>
                  <p className="text-2xl font-semibold text-foreground mt-1">{summary?.adminUsers ?? 0}</p>
                </div>
                <div className="rounded-xl border border-zinc-500/30 bg-zinc-500/[0.08] p-3">
                  <p className="text-xs uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Non-admin users
                  </p>
                  <p className="text-2xl font-semibold text-foreground mt-1">{summary?.nonAdminUsers ?? 0}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm sm:text-base font-semibold text-foreground">User management</h2>
                <p className="text-xs text-muted-foreground">Manage admin access</p>
              </div>
              {adminUsersQuery.isLoading ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading users...
                </div>
              ) : adminUsersQuery.isError ? (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Failed to load users</AlertTitle>
                  <AlertDescription>
                    {formatClientError(adminUsersQuery.error, "Could not fetch admin user data.")}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2.5">
                  {users.map((row) => {
                    const isUpdating = updatingUserId === row.userId;
                    const isSelf = row.userId === user.userId;
                    const rowInitials =
                      (row.name || "")
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() ?? "")
                        .join("") || "U";
                    return (
                      <div
                        key={row.userId}
                        className="rounded-xl border border-border/65 bg-background/60 px-3.5 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-border/70">
                            <AvatarImage src={row.profilePhotoUrl} alt={row.name || "User"} />
                            <AvatarFallback className="text-xs font-semibold">{rowInitials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{row.name || "Unnamed user"}</p>
                            <p className="text-sm text-muted-foreground truncate">{row.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={
                              row.isAdmin
                                ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300"
                                : "inline-flex items-center gap-1 rounded-full border border-zinc-500/35 bg-zinc-500/10 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
                            }
                          >
                            {row.isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
                            {row.isAdmin ? "Admin" : "User"}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant={row.isAdmin ? "outline" : "secondary"}
                            className="rounded-lg h-8"
                            disabled={isUpdating || isSelf}
                            onClick={() => onToggleAdmin(row.userId, !row.isAdmin)}
                            title={isSelf ? "You cannot change your own admin status here." : undefined}
                          >
                            {isUpdating ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : row.isAdmin ? (
                              "Remove admin"
                            ) : (
                              "Make admin"
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
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
