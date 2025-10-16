import { useState } from "react";
import { FilterButtons, type TimeFilter } from "../FilterButtons";

export default function FilterButtonsExample() {
  const [activeFilter, setActiveFilter] = useState<TimeFilter>("all");

  return (
    <div className="p-4">
      <FilterButtons 
        activeFilter={activeFilter} 
        onChange={(filter) => {
          setActiveFilter(filter);
          console.log("Filter changed to:", filter);
        }}
      />
    </div>
  );
}
