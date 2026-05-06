import { motion } from "framer-motion";
import { Search } from "lucide-react";
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
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  platformFilter: string;
  onPlatformFilterChange: (value: string) => void;
  applyFilter: string;
  onApplyFilterChange: (value: string) => void;
  platforms: string[];
}>;

export function HomeJobsToolbar({
  searchInput,
  onSearchInputChange,
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
      className="flex flex-wrap items-center gap-2 shrink-0"
    >
      <div className="relative flex-1 min-w-[min(100%,14rem)]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          placeholder="Search title, company, job ID…"
          className="pl-8 h-9 text-sm bg-background/60 border-border rounded-lg"
          aria-label="Search jobs"
        />
      </div>
      <Select value={platformFilter} onValueChange={onPlatformFilterChange}>
        <SelectTrigger className="h-9 text-sm bg-background/60 border-border rounded-lg w-full sm:w-[11.5rem] shrink-0">
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
        <SelectTrigger className="h-9 text-sm bg-background/60 border-border rounded-lg w-full sm:w-[11.5rem] shrink-0">
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
