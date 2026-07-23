import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type VendorNameCopyProps = {
  name: string;
  email: string;
  emailed?: boolean;
  className?: string;
};

export function VendorNameCopy({ name, email, emailed, className }: VendorNameCopyProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast({ title: "Copied", description: email });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${email}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate text-left text-sm font-medium transition-colors",
        copied
          ? "text-emerald-400"
          : emailed
            ? "text-emerald-400 hover:text-emerald-300"
            : "text-foreground hover:text-primary",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
      <span className="truncate">{name}</span>
    </button>
  );
}
