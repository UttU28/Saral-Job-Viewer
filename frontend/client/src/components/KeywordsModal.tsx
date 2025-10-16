import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Keyword } from "@shared/schema";

interface KeywordsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keywords: Keyword[];
  onAddKeyword?: (name: string, type: "SearchList" | "NoCompany") => void;
  onRemoveKeyword?: (id: number) => void;
}

export function KeywordsModal({
  open,
  onOpenChange,
  keywords,
  onAddKeyword,
  onRemoveKeyword,
}: KeywordsModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [blacklistTerm, setBlacklistTerm] = useState("");

  const searchTerms = keywords.filter((k) => k.type === "SearchList");
  const blacklistedCompanies = keywords.filter((k) => k.type === "NoCompany");

  const handleAddSearch = () => {
    if (searchTerm.trim() && onAddKeyword) {
      onAddKeyword(searchTerm.trim(), "SearchList");
      setSearchTerm("");
    }
  };

  const handleAddBlacklist = () => {
    if (blacklistTerm.trim() && onAddKeyword) {
      onAddKeyword(blacklistTerm.trim(), "NoCompany");
      setBlacklistTerm("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Keywords</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="search" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search" data-testid="tab-search-terms">
              Search Terms ({searchTerms.length})
            </TabsTrigger>
            <TabsTrigger value="blacklist" data-testid="tab-blacklist">
              Blacklisted Companies ({blacklistedCompanies.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="search" className="flex-1 overflow-hidden flex flex-col space-y-4 mt-4">
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                <div className="space-y-2">
                  <Label htmlFor="search-term">Add Search Term</Label>
                  <Input
                    id="search-term"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="e.g., Software Engineer, Python Developer..."
                    onKeyDown={(e) => e.key === "Enter" && handleAddSearch()}
                    data-testid="input-search-term"
                  />
                </div>
                <Button onClick={handleAddSearch} className="w-full sm:w-auto" data-testid="button-add-search">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto space-y-2">
              {searchTerms.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No search terms added yet
                </p>
              ) : (
                searchTerms.map((keyword) => (
                  <div
                    key={keyword.id}
                    className="flex items-center justify-between p-3 bg-card rounded-lg border hover-elevate"
                    data-testid={`keyword-item-${keyword.id}`}
                  >
                    <span className="flex-1">{keyword.name}</span>
                    {onRemoveKeyword && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveKeyword(keyword.id)}
                        className="h-8 w-8"
                        data-testid={`button-remove-${keyword.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="blacklist" className="flex-1 overflow-hidden flex flex-col space-y-4 mt-4">
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                <div className="space-y-2">
                  <Label htmlFor="blacklist-term">Add Company to Blacklist</Label>
                  <Input
                    id="blacklist-term"
                    value={blacklistTerm}
                    onChange={(e) => setBlacklistTerm(e.target.value)}
                    placeholder="e.g., BadCompany Inc, ScamCorp..."
                    onKeyDown={(e) => e.key === "Enter" && handleAddBlacklist()}
                    data-testid="input-blacklist-term"
                  />
                </div>
                <Button onClick={handleAddBlacklist} className="w-full sm:w-auto" data-testid="button-add-blacklist">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto space-y-2">
              {blacklistedCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No companies blacklisted yet
                </p>
              ) : (
                blacklistedCompanies.map((keyword) => (
                  <div
                    key={keyword.id}
                    className="flex items-center justify-between p-3 bg-card rounded-lg border hover-elevate"
                    data-testid={`keyword-item-${keyword.id}`}
                  >
                    <span className="flex-1">{keyword.name}</span>
                    {onRemoveKeyword && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveKeyword(keyword.id)}
                        className="h-8 w-8"
                        data-testid={`button-remove-${keyword.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
