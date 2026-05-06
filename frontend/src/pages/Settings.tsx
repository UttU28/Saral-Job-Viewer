import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Save, XCircle } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

function emailLooksValid(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function FieldRowStatus({
  ok,
  optionalEmpty,
  label,
}: Readonly<{
  ok: boolean;
  optionalEmpty?: boolean;
  label: string;
}>) {
  if (optionalEmpty) {
    return (
      <XCircle
        className="h-4 w-4 shrink-0 text-muted-foreground/45"
        aria-label={`${label} (optional, empty)`}
      />
    );
  }
  if (ok) {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label={`${label} OK`} />;
  }
  return <XCircle className="h-4 w-4 shrink-0 text-destructive/90" aria-label={`${label} missing or invalid`} />;
}

export default function Settings() {
  const { user, sessionProfile, updateSessionProfile } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (sessionProfile) {
      setName(sessionProfile.name);
      setEmail(sessionProfile.email);
      setPassword(sessionProfile.password);
      return;
    }
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setPassword("");
  }, [sessionProfile, user?.email, user?.name]);

  const matchesSavedSession = useMemo(() => {
    if (!sessionProfile) {
      return name.trim() === "" && email.trim() === "" && password === "";
    }
    return (
      sessionProfile.name === name.trim() &&
      sessionProfile.email === email.trim() &&
      sessionProfile.password === password
    );
  }, [name, email, password, sessionProfile]);

  const hasSessionProfile = useMemo(() => sessionProfile !== null, [sessionProfile]);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateSessionProfile({
      name: name.trim(),
      email: email.trim(),
      password,
    });
    setSavedFlash(true);
    globalThis.setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="min-h-full flex flex-col">
        <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-8">
        <Button variant="ghost" size="sm" className="mb-6 -ml-2 gap-2 text-muted-foreground" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to jobs
          </Link>
        </Button>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-xl rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-6 sm:p-8 space-y-6"
        >
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Saved in your local session on this browser. This profile is used for Midhtech submit.
            </p>

            <div
              className={cn(
                "mt-4 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm",
                matchesSavedSession
                  ? "border-emerald-500/35 bg-emerald-500/[0.07] text-foreground"
                  : "border-amber-500/35 bg-amber-500/[0.06] text-foreground",
              )}
              role="status"
            >
              {matchesSavedSession ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" aria-hidden />
              )}
              <span className="leading-snug">
                {matchesSavedSession ? (
                  <>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      In sync with session profile
                    </span>
                    {hasSessionProfile ? (
                      <span className="text-muted-foreground"> — form matches what is stored in this session.</span>
                    ) : (
                      <span className="text-muted-foreground"> — no profile saved yet.</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-amber-800 dark:text-amber-200/95">Unsaved changes</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — click <strong className="text-foreground font-medium">Save session profile</strong> to update
                      what Accept uses.
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Label htmlFor="settings-name">Name</Label>
                <FieldRowStatus
                  label="Name"
                  ok={name.trim().length > 0}
                  optionalEmpty={name.trim().length === 0}
                />
              </div>
              <Input
                id="settings-name"
                autoComplete="name"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                placeholder="Your name"
                className="bg-background/60 border-border rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Label htmlFor="settings-email">Email</Label>
                <FieldRowStatus label="Email" ok={emailLooksValid(email)} />
              </div>
              <Input
                id="settings-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="you@example.com"
                className="bg-background/60 border-border rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Label htmlFor="settings-password">Password</Label>
                <FieldRowStatus label="Password" ok={password.length > 0} />
              </div>
              <div className="relative">
                <Input
                  id="settings-password"
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(ev) => setPassword(ev.target.value)}
                  placeholder="••••••••"
                  className="bg-background/60 border-border rounded-xl pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setPasswordVisible((v) => !v)}
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

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
              <Button type="submit" className="rounded-xl gap-2 w-full sm:w-auto">
                <Save className="h-4 w-4" />
                Save session profile
              </Button>
              {savedFlash ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  Saved locally.
                </span>
              ) : null}
            </div>
          </form>
        </motion.div>
        </div>
        <Footer />
        </div>
      </div>
    </div>
  );
}
