import { Database } from "lucide-react";
import { ConnectionStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  isUsingSampleData?: boolean;
  usingSampleOnly?: boolean;
}

export function ConnectionStatusIndicator({ status, isUsingSampleData, usingSampleOnly }: ConnectionStatusIndicatorProps) {
  const getStatusStyles = () => {
    if (usingSampleOnly || isUsingSampleData) {
      return {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        text: 'text-amber-200',
        icon: 'text-amber-200'
      };
    }
    
    switch (status) {
      case 'connecting':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20',
          text: 'text-amber-200',
          icon: 'text-amber-200 animate-spin'
        };
      case 'fetching':
        return {
          bg: 'bg-sky-500/10',
          border: 'border-sky-500/20',
          text: 'text-sky-200',
          icon: 'text-sky-200 animate-spin'
        };
      case 'connected':
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/20',
          text: 'text-emerald-200',
          icon: 'text-emerald-200'
        };
      case 'error':
        return {
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/20',
          text: 'text-rose-200',
          icon: 'text-rose-200'
        };
    }
  };

  const getStatusText = () => {
    if (usingSampleOnly) return 'Sample Mode';
    if (isUsingSampleData) return 'Sample Data';
    
    switch (status) {
      case 'connecting':
        return 'Connecting API...';
      case 'fetching':
        return 'Fetching...';
      case 'connected':
        return 'Connected';
      case 'error':
        return 'Connection Error';
    }
  };

  const styles = getStatusStyles();

  return (
    <Button
      variant="outline"
      size="sm"
      className={`
        ${styles.bg} 
        ${styles.border} 
        ${styles.text} 
        hover:${styles.bg} 
        transition-all 
        duration-300 
        font-medium
        rounded-full
        px-4
        shadow-sm
        hover:shadow-md
        hover:scale-[1.02]
        active:scale-[0.98]
      `}
    >
      <Database className={`mr-2 h-3.5 w-3.5 ${styles.icon}`} />
      <span className="text-[13px]">{getStatusText()}</span>
    </Button>
  );
}