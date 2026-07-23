import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  fetchGmailStatus,
  MailApiError,
  sendGmail,
  startGmailAuth,
} from "@/lib/placetrack/mail-api";
import { buildVendorClassicDraftPayload, rememberVendorRecipient } from "@/lib/placetrack/vendor-draft";
import { PLACETRACK_PIPELINE_PATH } from "@/lib/placetrack/routing";
import { cn } from "@/lib/utils";

type VendorSendButtonProps = {
  email: string;
  name?: string;
  className?: string;
};

export function VendorSendButton({ email, name, className }: VendorSendButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSend = async (event: React.MouseEvent) => {
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
          description: "Connect Gmail to send from the pipeline.",
          variant: "destructive",
        });
        startGmailAuth(PLACETRACK_PIPELINE_PATH);
        return;
      }

      await sendGmail(await buildVendorClassicDraftPayload(trimmedEmail, trimmedName));
      toast({
        title: "Email sent",
        description: `Classic template sent to ${trimmedName || trimmedEmail}.`,
      });
    } catch (error) {
      const message = error instanceof MailApiError ? error.message : "Could not send email.";
      toast({ title: "Send failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSend}
      disabled={loading}
      title={`Send email to ${name?.trim() || email}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded p-0.5 transition-colors",
        loading
          ? "text-red-400 opacity-100"
          : "text-red-400 opacity-60 hover:text-red-400 hover:opacity-100",
        className,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
    </button>
  );
}
