import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TimeFilter = "all" | 1 | 3 | 6 | 24;

interface FilterButtonsProps {
  activeFilter: TimeFilter;
  onChange: (filter: TimeFilter) => void;
}

const filters: { value: TimeFilter; label: string }[] = [
  { value: 1, label: "Last 1 hour" },
  { value: 3, label: "Last 3 hours" },
  { value: 6, label: "Last 6 hours" },
  { value: 24, label: "Last 24 hours" },
  { value: "all", label: "All time" },
];

export function FilterButtons({ activeFilter, onChange }: FilterButtonsProps) {
  const activeLabel = filters.find(f => f.value === activeFilter)?.label || "All time";

  return (
    <Select 
      value={String(activeFilter)} 
      onValueChange={(value) => onChange(value === "all" ? "all" : Number(value) as TimeFilter)}
    >
      <SelectTrigger className="w-[160px]" data-testid="select-time-filter">
        <SelectValue placeholder={activeLabel} />
      </SelectTrigger>
      <SelectContent>
        {filters.map((filter) => (
          <SelectItem 
            key={filter.value} 
            value={String(filter.value)}
            data-testid={`filter-option-${filter.value}`}
          >
            {filter.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
