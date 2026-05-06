import type { LucideIcon } from "lucide-react";
import { Clapperboard, ExternalLink, Github, Heart, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";

const DEV_YOUTUBE = "https://www.youtube.com/@ThatInsaneGuy/";
const DEV_GITHUB_PROFILE = "https://github.com/UttU28/";
const PROJECT_REPO = "https://github.com/UttU28/Saral-Job-Viewer";
const WATCH_TOGETHER = "https://apeksha.thatinsaneguy.com/watch-together";

function FooterInlineLink({
  href,
  icon: Icon,
  label,
  iconClassName,
  className,
}: Readonly<{
  href: string;
  icon: LucideIcon;
  label: string;
  iconClassName?: string;
  className?: string;
}>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group max-w-full",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0 opacity-85", iconClassName)} aria-hidden />
      <span className="border-b border-transparent group-hover:border-foreground/25 transition-[border-color]">
        {label}
      </span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-45 group-hover:opacity-70" aria-hidden />
    </a>
  );
}

/** Site-wide footer: compact columns, subtle links, centered mantra row. */
export function Footer() {
  return (
    <footer
      className="w-full shrink-0 border-t border-border/80 bg-muted/25 dark:bg-muted/10"
      aria-label="Site footer and credits"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-11 pb-[max(2rem,env(safe-area-inset-bottom,1rem))] sm:pb-10">
        <div className="grid grid-cols-1 gap-9 sm:grid-cols-2 lg:grid-cols-3 sm:gap-x-10 lg:gap-x-14 xl:gap-x-20">
          <div className="min-w-0 space-y-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Developer</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="inline-flex items-start gap-2">
                <Heart className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0 fill-primary/20" aria-hidden />
                <span>
                  Made with keyboard and mouse by{" "}
                  <span className="text-foreground/90 font-medium">ThatInsaneGuy</span>
                </span>
              </span>
            </p>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5" aria-label="Developer links">
              <FooterInlineLink
                href={DEV_YOUTUBE}
                icon={Youtube}
                label="YouTube"
                iconClassName="text-red-500/85"
              />
              <FooterInlineLink href={DEV_GITHUB_PROFILE} icon={Github} label="GitHub · UttU28" />
            </nav>
          </div>

          <div className="min-w-0 space-y-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Open source</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Like what you see? Clone or fork{" "}
              <strong className="text-foreground font-medium">Saral Job Viewer</strong> and run it locally.
            </p>
            <div className="pt-0.5">
              <FooterInlineLink
                href={PROJECT_REPO}
                icon={Github}
                label="UttU28/Saral-Job-Viewer"
                className="font-mono text-xs sm:text-sm"
              />
            </div>
          </div>

          <div className="min-w-0 space-y-3 sm:col-span-2 lg:col-span-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Watch together</h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Sync movies with friends on{" "}
              <span className="text-foreground/85 font-medium">Apeksha</span>—same room, different screens.
            </p>
            <div className="pt-0.5">
              <FooterInlineLink
                href={WATCH_TOGETHER}
                icon={Clapperboard}
                label="Watch together"
                iconClassName="text-violet-500/85"
              />
            </div>
          </div>
        </div>

        <div className="mt-10 sm:mt-11 pt-7 border-t border-border/70">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
            <p className="order-2 md:order-1 text-center md:text-left text-[11px] sm:text-xs text-muted-foreground leading-snug">
              <span className="font-medium text-foreground/90">Saral Job Viewer</span>
            </p>
            <p
              lang="sa"
              className="order-1 md:order-2 text-center font-display text-sm sm:text-base font-semibold tracking-[0.06em] text-zinc-900 dark:text-white px-2 drop-shadow-sm dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
            >
              🔱 Yatra Tatra Sarvata Shiva 🔱
            </p>
            <p className="order-3 text-center md:text-right text-[11px] sm:text-xs text-muted-foreground shrink-0">
              Thanks for using this tool
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
