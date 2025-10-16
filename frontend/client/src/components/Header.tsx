import { RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
  onRefresh?: () => void;
  onOpenKeywords?: () => void;
}

export function Header({ onRefresh, onOpenKeywords }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold" data-testid="text-app-title">
            Saral Job Viewer
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-5 w-5" />
              <span className="sr-only">Refresh jobs</span>
            </Button>
          )}
          
          {onOpenKeywords && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenKeywords}
              className="gap-2"
              data-testid="button-keywords"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Keywords</span>
            </Button>
          )}
          
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
