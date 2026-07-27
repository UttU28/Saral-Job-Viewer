import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GmailStatus } from "@/lib/placetrack/mail-api";

type GmailConnectCardProps = {
  status: GmailStatus | null;
  isLoading?: boolean;
  onConnect: () => void;
};

function reasonMessage(status: GmailStatus | null): string {
  if (!status?.configured) {
    return "Gmail OAuth is not configured on the backend (missing client_secret.json).";
  }
  if (status.reason === "missingScopes") {
    return "Your Gmail token is missing sent-mail access. Reconnect to enable green vendor highlights.";
  }
  if (status.reason === "refreshFailed" || status.reason === "noToken") {
    return "Your Gmail token expired or is invalid. Connect again to continue.";
  }
  return "Connect Gmail to load sent emails and highlight vendors you've already contacted.";
}

export function GmailConnectCard({ status, isLoading, onConnect }: GmailConnectCardProps) {
  return (
    <Card className="glass-card w-full max-w-xl border-white/10">
      <CardHeader>
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Mail className="h-5 w-5" />
        </div>
        <CardTitle className="font-display text-2xl">Connect Gmail</CardTitle>
        <CardDescription>{reasonMessage(status)}</CardDescription>
      </CardHeader>
      <CardContent>
        {status?.configured ? (
          <Button className="glow-button w-full" disabled={isLoading} onClick={onConnect}>
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" />
                Checking Gmail...
              </>
            ) : (
              "Connect Gmail"
            )}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add <code className="text-xs">client_secret.json</code> to the Saral project root and restart the API.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
