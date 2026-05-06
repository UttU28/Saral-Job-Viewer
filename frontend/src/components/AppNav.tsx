import type { ReactNode } from "react";
import { Briefcase, Home, KeyRound, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
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
        "rounded-xl gap-2 h-9 sm:h-10",
        isActive && "bg-primary/15 text-primary border border-primary/25 shadow-sm shadow-primary/10",
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

export function AppNav() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="shrink-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="w-full px-3 sm:px-4 md:px-5">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4 w-full min-w-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <Link
              href="/"
              className="flex items-center gap-2 sm:gap-3 min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shrink-0"
            >
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/20 shadow-[0_0_24px_-4px_rgba(139,92,246,0.35)]">
                <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-primary" aria-hidden />
              </div>
              <span className="font-display font-bold text-sm sm:text-base md:text-lg tracking-tight text-foreground truncate">
                Saral Job Viewer
              </span>
            </Link>
            {user?.name ? (
              <span
                className="flex items-center min-w-0 text-[11px] sm:text-sm text-muted-foreground border-l border-border pl-2 sm:pl-4 ml-0.5"
                title={user.name}
              >
                Hi,{" "}
                <span className="font-medium text-foreground truncate max-w-[72px] sm:max-w-[180px] md:max-w-[260px] ml-0.5 sm:ml-1">
                  {user.name}
                </span>
              </span>
            ) : null}
          </div>

          <nav
            className="flex items-center gap-1.5 sm:gap-2 shrink-0"
            aria-label="Main navigation"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-xl h-9 w-9 sm:h-10 sm:w-10 text-foreground"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" aria-hidden />
              ) : (
                <Moon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" aria-hidden />
              )}
            </Button>
            <NavLink href="/" icon={Home}>
              Browse
            </NavLink>
            <NavLink href="/profile" icon={UserRound}>
              Profile
            </NavLink>
            <NavLink href="/change-password" icon={KeyRound}>
              Password
            </NavLink>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl gap-2 h-9 sm:h-10"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="text-xs sm:text-sm">Logout</span>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}
