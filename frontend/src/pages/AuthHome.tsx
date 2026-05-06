import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Github,
  Loader2,
  LogIn,
  MousePointerClick,
  Moon,
  Shield,
  Sun,
  UserPlus,
  Youtube,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatClientError } from "@/lib/api";

const DEV_YOUTUBE = "https://www.youtube.com/@ThatInsaneGuy/";
const DEV_GITHUB_PROFILE = "https://github.com/UttU28/";
const PROJECT_REPO = "https://github.com/UttU28/Saral-Job-Viewer";
const WATCH_TOGETHER = "https://apeksha.thatinsaneguy.com/watch-together";

function SubtleBullet({
  icon: Icon,
  children,
}: Readonly<{ icon: typeof Flame; children: ReactNode }>) {
  return (
    <li className="flex gap-2.5 text-sm text-muted-foreground leading-snug">
      <Icon className="h-4 w-4 shrink-0 text-primary/70 mt-0.5" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function TinyExternal({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
      <ExternalLink className="h-3 w-3 opacity-50" aria-hidden />
    </a>
  );
}

export default function AuthHome() {
  const [location, navigate] = useLocation();
  const mode = location === "/register" ? "register" : "login";
  const { login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordVisible, setRegPasswordVisible] = useState(false);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState("");

  useEffect(() => {
    setLoginError("");
    setRegError("");
  }, [mode]);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginSubmitting(true);
    setLoginError("");
    try {
      await login(loginEmail.trim(), loginPassword);
      toast({ title: "Signed in", description: "Welcome back." });
      navigate("/");
    } catch (error) {
      const message = formatClientError(error, "Login failed.");
      setLoginError(message);
      toast({
        variant: "destructive",
        title: "Could not sign in",
        description: message.length > 280 ? `${message.slice(0, 280)}…` : message,
      });
    } finally {
      setLoginSubmitting(false);
    }
  };

  const onRegister = async (event: FormEvent) => {
    event.preventDefault();
    setRegSubmitting(true);
    setRegError("");
    try {
      await register(regName.trim(), regEmail.trim(), regPassword);
      toast({ title: "Account created", description: "You are now signed in." });
      navigate("/");
    } catch (error) {
      const message = formatClientError(error, "Registration failed.");
      setRegError(message);
      toast({
        variant: "destructive",
        title: "Could not create account",
        description: message.length > 280 ? `${message.slice(0, 280)}…` : message,
      });
    } finally {
      setRegSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-0 min-w-0 flex-1 flex flex-col overflow-y-auto overflow-x-hidden scrollbar-themed pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary)/0.14),transparent_45%),radial-gradient(circle_at_90%_90%,rgba(16,185,129,0.08),transparent_42%)] dark:bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary)/0.12),transparent_48%),radial-gradient(circle_at_85%_85%,rgba(16,185,129,0.06),transparent_40%)]"
      />
        <div className="w-full max-w-6xl min-w-0 mx-auto flex-1 flex flex-col px-3 sm:px-5 md:px-8 pt-4 sm:pt-8 pb-8 gap-6 sm:gap-8">
        <motion.header
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="shrink-0 rounded-2xl border border-border/80 bg-card/25 dark:bg-card/20 backdrop-blur-sm overflow-hidden"
        >
          <div className="relative px-4 sm:px-7 py-6 sm:py-8">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 sm:right-4 sm:top-4 h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden />
              ) : (
                <Moon className="h-4 w-4" aria-hidden />
              )}
            </Button>
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex shrink-0 items-center justify-center">
                    <Briefcase className="h-4 w-4 text-foreground/85" aria-hidden />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Saral</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold font-display text-foreground tracking-tight">
                  Saral Job Viewer
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl">
                  A calm workspace to review listings, submit via Midhtech, and see your weekly applies—without noise.
                </p>
                <p className="text-xs text-muted-foreground/85 max-w-2xl">
                  <span className="text-foreground/80">Mon–Sun</span> stats · Same{" "}
                  <span className="text-foreground/80">email &amp; password</span> as Midhtech · Data stays with your account
                </p>
              </div>
            </div>
          </div>
        </motion.header>

        <div className="flex-1 min-h-0 grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_24rem] items-start">
          <motion.aside
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04, duration: 0.22 }}
            className="order-2 lg:order-1 rounded-2xl border border-border/60 bg-muted/20 dark:bg-muted/10 px-5 py-6 sm:px-6 sm:py-7 space-y-5"
          >
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">At a glance</h2>
            <ul className="space-y-3.5">
              <SubtleBullet icon={Briefcase}>
                Filter by platform and status; open a job and decide in context.
              </SubtleBullet>
              <SubtleBullet icon={Flame}>
                Small streak badge in the app tracks full applies for the current week.
              </SubtleBullet>
              <SubtleBullet icon={BarChart3}>
                Profile summarizes accepts and rejects by ISO week when you want the full picture.
              </SubtleBullet>
              {mode === "register" ? (
                <SubtleBullet icon={Shield}>
                  Register with the Midhtech credentials you’ll use to submit—keeps everything aligned.
                </SubtleBullet>
              ) : null}
            </ul>
            <div className="pt-4 border-t border-border/50 flex flex-wrap gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
              <TinyExternal href={PROJECT_REPO}>
                <Github className="h-3.5 w-3.5 opacity-70" />
                Source
              </TinyExternal>
              <span className="text-border hidden sm:inline">·</span>
              <TinyExternal href={DEV_YOUTUBE}>
                <Youtube className="h-3.5 w-3.5 opacity-70 text-red-500/80" />
                YouTube
              </TinyExternal>
              <span className="text-border hidden sm:inline">·</span>
              <TinyExternal href={WATCH_TOGETHER}>Watch together</TinyExternal>
              <span className="text-border hidden sm:inline">·</span>
              <TinyExternal href={DEV_GITHUB_PROFILE}>UttU28</TinyExternal>
            </div>
          </motion.aside>

          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="order-1 lg:order-2 w-full rounded-2xl border border-border bg-card/40 dark:bg-card/35 backdrop-blur-sm shadow-lg shadow-black/5 overflow-hidden"
          >
            <div className="p-1.5 mx-3 mt-3 sm:mx-4 sm:mt-4 rounded-xl bg-muted/40 dark:bg-muted/25 border border-border/50 flex gap-1">
              <Link
                href="/login"
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-center text-sm font-medium transition-colors touch-manipulation",
                  mode === "login"
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-center text-sm font-medium transition-colors touch-manipulation",
                  mode === "register"
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Create account
              </Link>
            </div>

            <div className="px-4 sm:px-6 pt-4 pb-6 sm:pb-7">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                {mode === "login" ? "Welcome back" : "New here"}
              </p>

              {mode === "login" ? (
                <>
                  {loginError ? (
                    <Alert variant="destructive" className="mb-4 rounded-xl">
                      <AlertTitle>Could not sign in</AlertTitle>
                      <AlertDescription>{loginError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <form onSubmit={onLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="auth-login-email">Email</Label>
                      <Input
                        id="auth-login-email"
                        type="email"
                        autoComplete="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="rounded-xl h-11 bg-background/80 border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="auth-login-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="auth-login-password"
                          type={loginPasswordVisible ? "text" : "password"}
                          autoComplete="current-password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Your password"
                          required
                          className="rounded-xl h-11 pr-11 bg-background/80 border-border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg"
                          onClick={() => setLoginPasswordVisible((v) => !v)}
                          aria-label={loginPasswordVisible ? "Hide password" : "Show password"}
                        >
                          {loginPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="w-full rounded-xl h-11 gap-2 touch-manipulation"
                      disabled={loginSubmitting}
                    >
                      {loginSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <LogIn className="h-4 w-4" aria-hidden />
                      )}
                      Sign in
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  {regError ? (
                    <Alert variant="destructive" className="mb-4 rounded-xl">
                      <AlertTitle>Could not create account</AlertTitle>
                      <AlertDescription>{regError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <form onSubmit={onRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="auth-reg-name">Name</Label>
                      <Input
                        id="auth-reg-name"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Your name"
                        autoComplete="name"
                        required
                        className="rounded-xl h-11 bg-background/80 border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="auth-reg-email">Email</Label>
                      <Input
                        id="auth-reg-email"
                        type="email"
                        autoComplete="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="rounded-xl h-11 bg-background/80 border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="auth-reg-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="auth-reg-password"
                          type={regPasswordVisible ? "text" : "password"}
                          autoComplete="new-password"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Choose a password"
                          required
                          className="rounded-xl h-11 pr-11 bg-background/80 border-border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg"
                          onClick={() => setRegPasswordVisible((v) => !v)}
                          aria-label={regPasswordVisible ? "Hide password" : "Show password"}
                        >
                          {regPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="w-full rounded-xl h-11 gap-2 touch-manipulation"
                      disabled={regSubmitting}
                    >
                      {regSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <UserPlus className="h-4 w-4" aria-hidden />
                      )}
                      Create account
                    </Button>
                  </form>
                </>
              )}
            </div>
          </motion.div>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.22 }}
          className="rounded-2xl border border-border/60 bg-card/20 dark:bg-card/10 px-4 sm:px-6 py-5 sm:py-6"
        >
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary mb-3.5">
            More details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            <div className="rounded-xl border border-border/70 bg-background/45 px-4 py-3.5">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 text-primary/75" aria-hidden />
                Weekly scope
              </p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Stats follow ISO weeks (Monday to Sunday), so your weekly streak and profile report stay in sync.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/45 px-4 py-3.5">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <MousePointerClick className="h-3.5 w-3.5 text-primary/75" aria-hidden />
                Decisions tracked
              </p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Each accept or reject action is timestamped and grouped by week to keep your activity clear.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/45 px-4 py-3.5">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary/75" aria-hidden />
                Session flow
              </p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Sign in once, browse quickly, and keep your Midhtech submit profile updated from inside the app.
              </p>
            </div>
          </div>
        </motion.section>

        <p className="pb-1 text-center text-[11px] sm:text-xs text-muted-foreground/85">
          <span className="font-medium text-foreground/90">Utsav × ThatInsaneGuy</span>
        </p>
      </div>
    </div>
  );
}
