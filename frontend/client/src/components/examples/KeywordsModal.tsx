import { useState } from "react";
import { KeywordsModal } from "../KeywordsModal";
import { Button } from "@/components/ui/button";
import type { Keyword } from "@shared/schema";

const mockKeywords: Keyword[] = [
  { id: 1, name: "Software Engineer", type: "SearchList" },
  { id: 2, name: "Python Developer", type: "SearchList" },
  { id: 3, name: "Frontend Developer", type: "SearchList" },
  { id: 10, name: "BadCompany Inc", type: "NoCompany" },
  { id: 11, name: "ScamCorp LLC", type: "NoCompany" },
];

export default function KeywordsModalExample() {
  const [open, setOpen] = useState(false);
  const [keywords, setKeywords] = useState<Keyword[]>(mockKeywords);

  const handleAdd = (name: string, type: "SearchList" | "NoCompany") => {
    const newKeyword: Keyword = {
      id: Date.now(),
      name,
      type,
      created_at: new Date().toISOString(),
    };
    setKeywords([...keywords, newKeyword]);
    console.log("Added keyword:", newKeyword);
  };

  const handleRemove = (id: number) => {
    setKeywords(keywords.filter((k) => k.id !== id));
    console.log("Removed keyword:", id);
  };

  return (
    <div className="p-4">
      <Button onClick={() => setOpen(true)}>Open Keywords Modal</Button>
      <KeywordsModal
        open={open}
        onOpenChange={setOpen}
        keywords={keywords}
        onAddKeyword={handleAdd}
        onRemoveKeyword={handleRemove}
      />
    </div>
  );
}
