import { PipelineTable } from "@/components/placetrack/PipelineTable";
import { Card, CardContent } from "@/components/ui/card";
import type { PipelineItem } from "@/lib/placetrack/pipeline-types";

type PipelineViewProps = {
  items: PipelineItem[];
  filteredItems: PipelineItem[];
  emailToPs: Map<string, string>;
  vendorDomainToCompany: Map<string, string>;
  sentRecipients?: Set<string>;
};

export function PipelineView({
  items,
  filteredItems,
  emailToPs,
  vendorDomainToCompany,
  sentRecipients,
}: PipelineViewProps) {
  return (
    <div>
      {filteredItems.length > 0 ? (
        <PipelineTable
          items={filteredItems}
          emailToPs={emailToPs}
          vendorDomainToCompany={vendorDomainToCompany}
          sentRecipients={sentRecipients}
        />
      ) : (
        <Card className="glass-card border-white/10">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {items.length === 0 ? "No pipeline items found." : "No items match your filters."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
