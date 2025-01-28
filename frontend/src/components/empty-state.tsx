import { InboxIcon, ClockIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useState } from 'react';
import { toast } from 'sonner';

interface EmptyStateProps {
  onHoursChange: (hours: number) => Promise<void>;
}

export function EmptyState({ onHoursChange }: EmptyStateProps) {
  const [hours, setHours] = useState<number>(6);
  const [isLoading, setIsLoading] = useState(false);

  const handleHoursSubmit = async () => {
    try {
      setIsLoading(true);
      await onHoursChange(hours);
      toast.success('Successfully fetched new jobs', {
        description: `Retrieved jobs from the last ${hours} hours`
      });
    } catch (error) {
      toast.error('Failed to fetch jobs', {
        description: error instanceof Error ? error.message : 'Please try again later'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="h-24 w-24 rounded-full bg-accent/10 flex items-center justify-center mb-6">
        <InboxIcon className="h-12 w-12 text-accent" />
      </div>
      <h3 className="text-2xl font-semibold text-foreground mb-2">
        No Jobs Found
      </h3>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        Try expanding your search by increasing the time range or use the "Fetch New Jobs" button to refresh the listings.
      </p>

      <div className="w-full max-w-md space-y-6 bg-black/40 p-6 rounded-lg border border-border/20">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Hours of Data</label>
            <span className="text-sm text-muted-foreground">
              {hours === 0 ? 'Now' : `${hours} hours`}
            </span>
          </div>
          <Slider
            value={[hours]}
            onValueChange={(value) => setHours(value[0])}
            min={0}
            max={48}
            step={1}
            className="w-full"
            disabled={isLoading}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Now</span>
            <span>24h</span>
            <span>48h</span>
          </div>
        </div>

        <Button
          onClick={handleHoursSubmit}
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ClockIcon className="h-4 w-4 mr-2" />
          )}
          {isLoading ? 'Fetching Jobs...' : 'Fetch Jobs'}
        </Button>
      </div>
    </div>
  );
}