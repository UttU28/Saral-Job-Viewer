import { useEffect, useState, type ReactNode } from "react";
import { Briefcase, Flame, Home, LogOut, Menu, Moon, Shield, Sun, UserRound } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { useCurrentWeekAcceptsQuery } from "@/hooks/use-jobs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  icon: Icon,
  children,
}: Readonly<{
  href: string;
  icon: typeof Home;
  children: ReactNode;
}>) {
  const [isActive] = useRoute(href);
  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      size="sm"
      className={cn(
        "rounded-xl gap-2 h-9 sm:h-10 transition-all duration-200 hover:bg-muted/80 touch-manipulation",
        isActive &&
          "bg-primary/15 text-primary border border-primary/25 shadow-sm shadow-primary/10 ring-1 ring-primary/10",
      )}
      asChild
    >
      <Link href={href}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs sm:text-sm">{children}</span>
      </Link>
    </Button>
  );
}

function MobileNavRow({
  href,
  icon: Icon,
  label,
  onNavigate,
}: Readonly<{
  href: string;
  icon: typeof Home;
  label: string;
  onNavigate: () => void;
}>) {
  const [isActive] = useRoute(href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-medium transition-colors touch-manipulation",
        isActive
          ? "border-primary/35 bg-primary/10 text-primary"
          : "border-border/80 bg-muted/30 text-foreground active:bg-muted/50",
      )}
    >
      <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
      {label}
    </Link>
  );
}

export function AppNav() {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentWeekAccepts = useCurrentWeekAcceptsQuery();
  const weekAcceptCount = currentWeekAccepts.data?.acceptedCount ?? null;
  const streakTitle =
    currentWeekAccepts.data?.weekStartIso && currentWeekAccepts.data?.weekEndIso
      ? `${weekAcceptCount ?? 0} accept${weekAcceptCount === 1 ? "" : "s"} this week (${currentWeekAccepts.data.weekStartIso}–${currentWeekAccepts.data.weekEndIso})`
      : `${weekAcceptCount ?? 0} accept${weekAcceptCount === 1 ? "" : "s"} this week`;

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const closeMobile = () => setMobileOpen(false);
  const userInitials =
    (user?.name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U";

  const streakPill = (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1 shrink-0 rounded-full border px-2 sm:px-2.5 py-0.5 touch-manipulation",
        "border-amber-600/35 bg-gradient-to-b from-amber-100/95 to-orange-50/90 text-amber-950",
        "shadow-[0_1px_0_0_rgba(251,146,60,0.25),0_0_14px_-3px_rgba(234,88,12,0.2)]",
        "dark:border-amber-400/40 dark:from-amber-500/25 dark:to-orange-600/18 dark:text-amber-50",
        "dark:shadow-[0_0_14px_-3px_rgba(251,146,60,0.4)]",
      )}
      title={streakTitle}
      aria-label={streakTitle}
    >
      <Flame
        className={cn(
          "h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem] shrink-0",
          "text-orange-600 fill-orange-500/55 drop-shadow-sm",
          "dark:text-amber-400 dark:fill-amber-500/50 dark:drop-shadow-[0_0_6px_rgba(251,191,36,0.45)]",
        )}
        aria-hidden
      />
      <span className="tabular-nums text-sm sm:text-base font-bold tracking-tight text-amber-950 dark:text-amber-50">
        {weekAcceptCount}
      </span>
    </span>
  );

  return (
    <header className="shrink-0 z-50 w-full border-b border-border/80 bg-gradient-to-b from-background/92 via-background/85 to-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 shadow-[0_1px_0_0_hsl(var(--primary)/0.08)]">
      <div className="w-full px-3 sm:px-4 md:px-5 max-w-[100vw] overflow-x-hidden">
        <div className="flex min-h-14 sm:min-h-16 py-1.5 sm:py-0 items-center justify-between gap-2 sm:gap-4 w-full min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-3 md:gap-4 min-w-0 flex-1">
            <Link
              href="/"
              className="group flex items-center gap-1.5 sm:gap-3 min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shrink-0 transition-transform active:scale-[0.98] touch-manipulation"
            >
              <div className="flex shrink-0 items-center justify-center">
                <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-foreground/85" aria-hidden />
              </div>
              <div className="min-w-0 flex items-center gap-1.5 sm:gap-2 leading-tight">
                <span className="font-display font-bold text-xs sm:text-base md:text-lg tracking-tight text-foreground truncate max-w-[6.5rem] min-[400px]:max-w-[10rem] sm:max-w-[14rem] md:max-w-none">
                  Saral Job Viewer
                </span>
              </div>
            </Link>
            {user?.name ? (
              <span
                className="hidden md:flex items-center min-w-0 text-sm text-muted-foreground border-l border-border pl-3 md:pl-4"
                title={user.name}
              >
                <Avatar className="h-7 w-7 mr-2.5">
                  <AvatarImage src={user.profilePhotoUrl} alt={user.name || "User"} />
                  <AvatarFallback className="text-[11px] font-semibold">{userInitials}</AvatarFallback>
                </Avatar>
                Hi,{" "}
                <span className="font-medium text-foreground truncate max-w-[180px] lg:max-w-[260px] ml-1">
                  {user.name}
                </span>
              </span>
            ) : null}
            {weekAcceptCount !== null ? (
              <span className="hidden min-[380px]:inline-flex">{streakPill}</span>
            ) : currentWeekAccepts.isLoading ? (
              <span className="hidden min-[380px]:inline-flex h-7 w-12 sm:w-14 rounded-full bg-muted/60 animate-pulse shrink-0" aria-hidden />
            ) : null}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {weekAcceptCount !== null ? (
              <span className="inline-flex min-[380px]:hidden">{streakPill}</span>
            ) : currentWeekAccepts.isLoading ? (
              <span className="inline-flex min-[380px]:hidden h-7 w-12 rounded-full bg-muted/60 animate-pulse shrink-0" aria-hidden />
            ) : null}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-xl h-9 w-9 sm:h-10 sm:w-10 text-foreground touch-manipulation shrink-0"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" aria-hidden />
              ) : (
                <Moon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" aria-hidden />
              )}
            </Button>

            <nav
              className="hidden md:flex items-center gap-1.5 lg:gap-2"
              aria-label="Main navigation"
            >
              <NavLink href="/" icon={Home}>
                Browse
              </NavLink>
              <NavLink href="/profile" icon={UserRound}>
                Profile
              </NavLink>
              {user?.isAdmin ? (
                <NavLink href="/admin" icon={Shield}>
                  Admin
                </NavLink>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl gap-2 h-9 sm:h-10 touch-manipulation border-destructive/65 text-destructive hover:bg-transparent"
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
              >
                <LogOut className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                <span className="text-xs sm:text-sm">Logout</span>
              </Button>
            </nav>

            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="md:hidden rounded-xl h-9 w-9 shrink-0 touch-manipulation border-border/80"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[min(100vw-1rem,20rem)] p-0 flex flex-col gap-0 border-border bg-background pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
              >
                <SheetHeader className="px-4 pt-6 pb-4 text-left border-b border-border/80 space-y-3">
                  <SheetTitle className="font-display text-lg">Menu</SheetTitle>
                  {user?.name ? (
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.profilePhotoUrl} alt={user.name || "User"} />
                        <AvatarFallback className="text-xs font-semibold">{userInitials}</AvatarFallback>
                      </Avatar>
                      <p className="text-sm text-muted-foreground font-normal">
                        Signed in as{" "}
                        <span className="font-medium text-foreground break-words">{user.name}</span>
                      </p>
                    </div>
                  ) : null}
                  {weekAcceptCount !== null ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">This week</span>
                      {streakPill}
                    </div>
                  ) : null}
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scrollbar-themed">
                  <MobileNavRow href="/" icon={Home} label="Browse jobs" onNavigate={closeMobile} />
                  <MobileNavRow href="/profile" icon={UserRound} label="Profile & report" onNavigate={closeMobile} />
                  {user?.isAdmin ? (
                    <MobileNavRow href="/admin" icon={Shield} label="Admin" onNavigate={closeMobile} />
                  ) : null}
                </div>
                <div className="px-4 pb-4 pt-2 border-t border-border/80 space-y-2 mt-auto">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full rounded-xl gap-2 h-11 touch-manipulation justify-center"
                    onClick={() => {
                      toggleTheme();
                    }}
                  >
                    {theme === "dark" ? (
                      <Sun className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <Moon className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {theme === "dark" ? "Light theme" : "Dark theme"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl gap-2 h-11 touch-manipulation justify-center text-destructive border-destructive/65 hover:bg-transparent"
                    onClick={async () => {
                      await logout();
                      closeMobile();
                      navigate("/login");
                    }}
                  >
                    <LogOut className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                    Log out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
