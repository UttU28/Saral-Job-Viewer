import { AlertTriangleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="h-24 w-24 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
        <AlertTriangleIcon className="h-12 w-12 text-destructive" />
      </div>
      <h3 className="text-2xl font-semibold text-foreground mb-2">
        Something went wrong
      </h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        {error}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="min-w-[200px]">
          Try Again
        </Button>
      )}
    </div>
  );
}