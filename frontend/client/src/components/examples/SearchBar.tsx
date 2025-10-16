import { useState } from "react";
import { SearchBar } from "../SearchBar";

export default function SearchBarExample() {
  const [search, setSearch] = useState("");

  return (
    <div className="p-4">
      <SearchBar 
        value={search} 
        onChange={setSearch}
        placeholder="Search jobs by title, company, location..."
      />
    </div>
  );
}
