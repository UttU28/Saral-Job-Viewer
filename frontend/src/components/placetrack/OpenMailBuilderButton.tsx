import { FilePenLine } from "lucide-react";
import { useLocation } from "wouter";
import { mailBuilderLocation } from "@/lib/placetrack/routing";
import { saveRecipientEmail, saveRecipientName } from "@/lib/placetrack/mail-profile";
import { cn } from "@/lib/utils";

type OpenMailBuilderButtonProps = {
  email: string;
  name?: string;
  className?: string;
};

export function OpenMailBuilderButton({ email, name, className }: OpenMailBuilderButtonProps) {
  const [, setLocation] = useLocation();

  const handleOpen = (event: React.MouseEvent) => {
    event.stopPropagation();
    const trimmedEmail = email.trim();
    const trimmedName = (name ?? "").trim();
    saveRecipientEmail(trimmedEmail);
    saveRecipientName(trimmedName);
    setLocation(mailBuilderLocation(trimmedEmail, trimmedName));
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      title={`Open Mail Builder for ${name?.trim() || email}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground opacity-40 transition-colors hover:text-primary hover:opacity-100",
        className,
      )}
    >
      <FilePenLine className="h-3.5 w-3.5" />
    </button>
  );
}
