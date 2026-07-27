import { Copy, ExternalLink, KeyRound, Loader2, Mail, RefreshCw, Send } from "lucide-react";
import { Link, useLocation } from "wouter";
import { PipelineFiltersBar } from "@/components/placetrack/PipelineFiltersBar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MailBuilderToolbar } from "@/lib/placetrack/mail-builder-toolbar";
import type { PipelineFilters } from "@/lib/placetrack/pipeline-filters";
import { isPlaceTrackMailLocation } from "@/lib/placetrack/routing";

type PipelineActions = {
  isLoading: boolean;
  itemCount?: number;
  onRefresh: () => void;
  onLogout: () => void;
};

type FilterBarProps = {
  filters: PipelineFilters;
  onChange: (filters: PipelineFilters) => void;
  statusOptions: string[];
  technologyOptions: string[];
};

type PlaceTrackHeaderProps = {
  pipeline?: PipelineActions;
  filterBar?: FilterBarProps;
  mailBuilder?: MailBuilderToolbar;
};

function SubNavLink({ href, children, mailTab }: { href: string; children: React.ReactNode; mailTab: boolean }) {
  const [location] = useLocation();
  const active = mailTab ? isPlaceTrackMailLocation(location) : !isPlaceTrackMailLocation(location);
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
        active ? "bg-primary/15 text-primary ring-1 ring-primary/25" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function PlaceTrackHeader({ pipeline, filterBar, mailBuilder }: PlaceTrackHeaderProps) {
  const [location] = useLocation();
  const onPipelinePage = !isPlaceTrackMailLocation(location);

  return (
    <div className="shrink-0 border-b border-border/80 bg-gradient-to-b from-card/80 to-background/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <nav className="flex shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-muted/20 p-1">
          <SubNavLink href="/" mailTab={false}>
            Pipeline
          </SubNavLink>
          <SubNavLink href="/mail" mailTab={true}>
            Mail Builder
          </SubNavLink>
        </nav>

        {onPipelinePage && pipeline?.itemCount !== undefined ? (
          <span className="hidden shrink-0 rounded-md bg-primary/10 px-2.5 py-1 text-xs tabular-nums text-primary ring-1 ring-primary/20 sm:inline-flex">
            {pipeline.itemCount.toLocaleString()} records
          </span>
        ) : null}

        {onPipelinePage && filterBar ? (
          <PipelineFiltersBar {...filterBar} embedded />
        ) : null}

        {!onPipelinePage ? (
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <h2 className="font-display text-sm font-semibold tracking-tight sm:text-base">Mail Builder</h2>
            <p className="truncate text-xs text-muted-foreground">
              {mailBuilder?.subtitle ?? "Loading templates…"}
            </p>
          </div>
        ) : null}

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1 sm:gap-2">
          {!onPipelinePage ? (
            <>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => mailBuilder?.onCreateDraft()}
                disabled={!mailBuilder || mailBuilder.draftLoading || !mailBuilder.gmailConnected}
              >
                {mailBuilder?.draftLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Create draft
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                onClick={() => mailBuilder?.onSend()}
                disabled={!mailBuilder || mailBuilder.sendLoading || !mailBuilder.gmailConnected}
              >
                {mailBuilder?.sendLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => void mailBuilder?.onCopyLink()}
                disabled={!mailBuilder}
                title="Copy compose URL"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => mailBuilder?.onOpenGmail()}
                disabled={!mailBuilder}
                title="Open compose"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}

          {onPipelinePage ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-red-500 hover:bg-red-500/10 hover:text-red-400"
              asChild
            >
              <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" title="Open Gmail">
                <Mail className="h-4 w-4" />
              </a>
            </Button>
          ) : null}

          {onPipelinePage && pipeline ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-sky-500 hover:bg-sky-500/10 hover:text-sky-400"
                onClick={pipeline.onRefresh}
                disabled={pipeline.isLoading}
                title="Refresh pipeline"
              >
                {pipeline.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                onClick={pipeline.onLogout}
                title="Change token"
              >
                <KeyRound className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
