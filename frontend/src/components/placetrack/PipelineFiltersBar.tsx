import { MailCheck, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_FILTERS, type PipelineFilters } from "@/lib/placetrack/pipeline-filters";
import { cn } from "@/lib/utils";
type PipelineFiltersBarProps = {
  filters: PipelineFilters;
  onChange: (filters: PipelineFilters) => void;
  statusOptions: string[];
  technologyOptions: string[];
  embedded?: boolean;
};

export function PipelineFiltersBar({
  filters,
  onChange,
  statusOptions,
  technologyOptions,
  embedded = false,
}: PipelineFiltersBarProps) {
  const update = (patch: Partial<PipelineFilters>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div
      className={
        embedded
          ? "flex min-w-0 flex-1 flex-wrap items-center gap-2"
          : "glass-card flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3"
      }
    >
      <div className="relative min-w-[140px] flex-1 basis-[180px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search roles, vendors, clients…"
          value={filters.search}
          onChange={(event) => update({ search: event.target.value })}
          className="h-9 pl-9 text-sm"
        />
      </div>

      <Select value={filters.status} onValueChange={(value) => update({ status: value })}>
        <SelectTrigger className="h-9 w-[140px] text-sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {statusOptions.map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.technology} onValueChange={(value) => update({ technology: value })}>
        <SelectTrigger className="h-9 w-[130px] text-sm">
          <SelectValue placeholder="Tech" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tech</SelectItem>
          {technologyOptions.map((tech) => (
            <SelectItem key={tech} value={tech}>
              {tech}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant={filters.sortSentFirst ? "secondary" : "ghost"}
        size="icon"
        className={cn(
          "h-8 w-8 shrink-0",
          filters.sortSentFirst
            ? "text-emerald-500 hover:text-emerald-400"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => update({ sortSentFirst: !filters.sortSentFirst })}
        title={
          filters.sortSentFirst
            ? "Sent vendors on top — click for date sort only"
            : "Date sort only — click to pin sent vendors on top"
        }
      >
        <MailCheck className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => onChange(DEFAULT_FILTERS)}
        title="Reset filters"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}
