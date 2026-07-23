import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  createGmailDraft,
  fetchGmailStatus,
  MailApiError,
  startGmailAuth,
} from "@/lib/placetrack/mail-api";
import { buildVendorClassicDraftPayload, rememberVendorRecipient } from "@/lib/placetrack/vendor-draft";
import { PLACETRACK_PIPELINE_PATH } from "@/lib/placetrack/routing";
import { cn } from "@/lib/utils";

type VendorDraftButtonProps = {
  email: string;
  name?: string;
  className?: string;
};

export function VendorDraftButton({ email, name, className }: VendorDraftButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDraft = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (loading) return;

    const trimmedEmail = email.trim();
    const trimmedName = (name ?? "").trim();
    if (!trimmedEmail) return;

    rememberVendorRecipient(trimmedEmail, trimmedName);
    setLoading(true);

    try {
      const status = await fetchGmailStatus();
      if (!status.connected) {
        toast({
          title: "Gmail not connected",
          description: "Connect Gmail to create drafts from the pipeline.",
          variant: "destructive",
        });
        startGmailAuth(PLACETRACK_PIPELINE_PATH);
        return;
      }

      const result = await createGmailDraft(await buildVendorClassicDraftPayload(trimmedEmail, trimmedName));
      const attachmentCount = result.attachmentsCount ?? result.attachments_count ?? 0;

      toast({
        title: "Draft created",
        description: `Classic template saved for ${trimmedName || trimmedEmail}${
          attachmentCount ? ` with ${attachmentCount} attachment(s)` : ""
        }.`,
      });
    } catch (error) {
      const message = error instanceof MailApiError ? error.message : "Could not create draft.";
      toast({ title: "Draft failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDraft}
      disabled={loading}
      title={`Save Gmail draft for ${name?.trim() || email}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded p-0.5 transition-colors",
        loading
          ? "text-sky-400 opacity-100"
          : "text-sky-400 opacity-60 hover:text-sky-400 hover:opacity-100",
        className,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
    </button>
  );
}
