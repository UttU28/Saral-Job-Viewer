import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, Save } from "lucide-react";
import { readProfileFromCookie, writeProfileToCookie } from "@/lib/profileCookie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";

export default function Settings() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const existing = readProfileFromCookie();
    if (existing) {
      setName(existing.name);
      setEmail(existing.email);
      setPassword(existing.password);
    }
  }, []);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    writeProfileToCookie({
      name: name.trim(),
      email: email.trim(),
      password,
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div className="w-full min-w-0 min-h-0 flex-1 overflow-y-auto pb-16 scrollbar-themed">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 max-w-lg mx-auto pt-8 sm:pt-10">
        <Button variant="ghost" size="sm" className="mb-6 -ml-2 gap-2 text-muted-foreground" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to jobs
          </Link>
        </Button>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-6 sm:p-8 space-y-6"
        >
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Saved in your browser as a cookie (this device only). Do not use a real password you
              reuse elsewhere.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Name</Label>
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
              <Label htmlFor="settings-email">Email</Label>
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
              <Label htmlFor="settings-password">Password</Label>
              <Input
                id="settings-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                placeholder="••••••••"
                className="bg-background/60 border-border rounded-xl"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
              <Button type="submit" className="rounded-xl gap-2 w-full sm:w-auto">
                <Save className="h-4 w-4" />
                Save to cookie
              </Button>
              {savedFlash ? (
                <span className="text-sm text-primary font-medium">Saved locally.</span>
              ) : null}
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
