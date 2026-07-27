import { useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPlaceTrackJwtFromDb } from "@/lib/placetrack/jwt-storage";

type JwtAuthFormProps = {
  onUseSaved: (token: string) => Promise<void>;
  onFetchNew: () => Promise<string | null>;
  isLoading?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
};

export function JwtAuthForm({
  onUseSaved,
  onFetchNew,
  isLoading = false,
  error = null,
  title = "Connect to PlaceTrack",
  description = "JWT is saved in MongoDB and shared across devices. Fetch a new token or load the pipeline with the one below.",
}: JwtAuthFormProps) {
  const [token, setToken] = useState("");

  useEffect(() => {
    void loadPlaceTrackJwtFromDb().then((saved) => {
      if (saved) setToken(saved);
    });
  }, []);

  const handleUseSaved = async () => {
    await onUseSaved(token);
  };

  const handleFetchNew = async () => {
    const fresh = await onFetchNew();
    if (fresh) setToken(fresh);
  };

  return (
    <Card className="glass-card w-full max-w-xl border-white/10">
      <CardHeader>
        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <CardTitle className="font-display text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="jwt">JWT token</Label>
          <Input
            id="jwt"
            type="text"
            placeholder="Fetch a token below or paste one here"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
            disabled={isLoading}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={isLoading || !token.trim()}
            onClick={handleUseSaved}
          >
            {isLoading ? <Loader2 className="animate-spin" /> : "Use JWT & load pipeline"}
          </Button>

          <Button type="button" className="glow-button w-full" disabled={isLoading} onClick={handleFetchNew}>
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Fetch & save JWT
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
