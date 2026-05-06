import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_VALUE, APPLY_OPTIONS } from "./constants";

type HomeJobsToolbarProps = Readonly<{
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onSearchCommit: () => void;
  platformFilter: string;
  onPlatformFilterChange: (value: string) => void;
  applyFilter: string;
  onApplyFilterChange: (value: string) => void;
  platforms: string[];
}>;

export function HomeJobsToolbar({
  searchDraft,
  onSearchDraftChange,
  onSearchCommit,
  platformFilter,
  onPlatformFilterChange,
  applyFilter,
  onApplyFilterChange,
  platforms,
}: HomeJobsToolbarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 }}
      className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0 touch-manipulation rounded-xl sm:rounded-2xl border border-border/70 bg-card/45 px-2.5 sm:px-3 py-2"
    >
      <form
        className="flex flex-1 min-w-[min(100%,14rem)] gap-1 items-center"
        onSubmit={(event) => {
          event.preventDefault();
          onSearchCommit();
        }}
      >
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchDraft}
            onChange={(e) => onSearchDraftChange(e.target.value)}
            placeholder="Search title, company, job ID…"
            className="pl-8 h-10 sm:h-9 text-base sm:text-sm bg-background/70 border-border/80 rounded-lg pr-2.5"
            aria-label="Search jobs"
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="h-10 w-8 sm:h-9 sm:w-8 min-h-0 shrink-0 rounded-lg px-0 text-muted-foreground hover:text-foreground hover:bg-transparent shadow-none active:shadow-none touch-manipulation [&_svg]:h-3.5 [&_svg]:w-3.5"
          aria-label="Search"
        >
          <Search aria-hidden />
        </Button>
      </form>
      <Select value={platformFilter} onValueChange={onPlatformFilterChange}>
        <SelectTrigger className="h-10 sm:h-9 text-base sm:text-sm bg-background/70 border-border/80 rounded-lg w-full sm:w-[11.5rem] shrink-0">
          <SelectValue placeholder="Platform" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All platforms</SelectItem>
          {platforms.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={applyFilter} onValueChange={onApplyFilterChange}>
        <SelectTrigger className="h-10 sm:h-9 text-base sm:text-sm bg-background/70 border-border/80 rounded-lg w-full sm:w-[11.5rem] shrink-0">
          <SelectValue placeholder="Apply status" />
        </SelectTrigger>
        <SelectContent>
          {APPLY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </motion.div>
  );
}
