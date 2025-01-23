import { InboxIcon } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="h-24 w-24 rounded-full bg-accent/10 flex items-center justify-center mb-6">
        <InboxIcon className="h-12 w-12 text-accent" />
      </div>
      <h3 className="text-2xl font-semibold text-foreground mb-2">
        No Jobs Left
      </h3>
      <p className="text-muted-foreground text-center max-w-md">
        You've processed all available jobs! Check back later for new opportunities or use the "Fetch New Jobs" button to refresh the listings.
      </p>
    </div>
  );
}