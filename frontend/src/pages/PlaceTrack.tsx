import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/auth/AuthProvider";
import { PlaceTrackHeader } from "@/components/placetrack/PlaceTrackHeader";
import { PlaceTrackMailPanel } from "@/components/placetrack/PlaceTrackMailPanel";
import { JwtAuthForm } from "@/components/placetrack/JwtAuthForm";
import { PipelineView } from "@/components/placetrack/PipelineView";
import { GmailConnectCard } from "@/components/placetrack/GmailConnectCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Footer } from "@/components/Footer";
import { usePlaceTrackGmailAuth } from "@/hooks/use-placetrack-gmail";
import { useMailTemplates } from "@/hooks/use-mail-templates";
import { usePlaceTrackPipeline } from "@/hooks/use-placetrack-pipeline";
import { usePlaceTrackSentRecipients } from "@/hooks/use-placetrack-sent-recipients";
import type { MailBuilderToolbar } from "@/lib/placetrack/mail-builder-toolbar";
import {
  filterPipelineItems,
  getStatusOptions,
  getTechnologyOptions,
  loadSavedFilters,
  saveFilters,
  type PipelineFilters,
} from "@/lib/placetrack/pipeline-filters";
import { normalizePipelineData } from "@/lib/placetrack/pipeline-types";
import { EMAILS_PATH, getPlaceTrackTab } from "@/lib/placetrack/routing";
import { cn } from "@/lib/utils";

function PipelineSkeleton() {
  return <Skeleton className="h-[min(520px,60vh)] w-full rounded-xl bg-muted/40" />;
}

function PlaceTrackAdminDenied() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="flex flex-col">
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 min-w-0">
            <Alert variant="destructive" className="rounded-2xl">
              <AlertTitle>Admin access required</AlertTitle>
              <AlertDescription>
                PlaceTrack is only visible to users with admin access.
              </AlertDescription>
            </Alert>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}

function PlaceTrackShellContent() {
  const [location, setLocation] = useLocation();
  const tab = getPlaceTrackTab(location);
  const isMailTab = tab === "mail";
  const isPipelineTab = tab === "pipeline";
  useMailTemplates();

  // Old nested /placetrack/emails (wouter nest strips prefix → "/emails") → top-level Emails
  useEffect(() => {
    if (location === "/emails" || location.startsWith("/emails?")) {
      setLocation(EMAILS_PATH);
    }
  }, [location, setLocation]);

  const {
    data,
    emailToPs,
    vendorDomainToCompany,
    isLoading,
    error,
    needsAuth,
    useSavedToken,
    fetchNewToken,
    logout,
    refresh,
  } = usePlaceTrackPipeline();

  const [filters, setFilters] = useState<PipelineFilters>(loadSavedFilters);
  const [mailToolbar, setMailToolbar] = useState<MailBuilderToolbar | null>(null);

  const pipelineLoaded = Boolean(data) && !needsAuth;
  const {
    status: gmailStatus,
    isLoading: gmailLoading,
    needsConnect: needsGmailConnect,
    check: checkGmail,
    connect: connectGmail,
  } = usePlaceTrackGmailAuth(pipelineLoaded && isPipelineTab, true, "/placetrack");
  const { sentRecipients, refresh: refreshSentRecipients } = usePlaceTrackSentRecipients(
    pipelineLoaded && !needsGmailConnect,
  );

  const items = useMemo(() => (data ? normalizePipelineData(data) : []), [data]);
  const statusOptions = useMemo(() => getStatusOptions(items), [items]);
  const technologyOptions = useMemo(() => getTechnologyOptions(items), [items]);
  const filteredItems = useMemo(
    () => filterPipelineItems(items, filters, sentRecipients),
    [items, filters, sentRecipients],
  );

  useEffect(() => {
    saveFilters(filters);
  }, [filters]);

  const handleRefresh = () => {
    void refresh();
    void checkGmail().then((status) => {
      if (status?.connected) {
        void refreshSentRecipients(true);
      }
    });
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <PlaceTrackHeader
        pipeline={
          !needsAuth
            ? {
                isLoading,
                itemCount: data ? items.length : undefined,
                onRefresh: handleRefresh,
                onLogout: () => void logout(),
              }
            : undefined
        }
        filterBar={
          isPipelineTab && data && !needsAuth
            ? {
                filters,
                onChange: setFilters,
                statusOptions,
                technologyOptions,
              }
            : undefined
        }
        mailBuilder={isMailTab ? (mailToolbar ?? undefined) : undefined}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className={cn(isPipelineTab ? "block" : "hidden")}>
          <div className="mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-6 sm:py-4">
            {isLoading && !data ? (
              <PipelineSkeleton />
            ) : error && !data && !needsAuth ? (
              <div className="glass-card rounded-xl border border-destructive/30 p-8 text-center">
                <h2 className="mb-2 font-display text-lg font-semibold text-destructive">Failed to load pipeline</h2>
                <p className="mb-4 text-sm text-muted-foreground">{error}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button size="sm" onClick={() => void refresh()}>
                    Try again
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void logout()}>
                    Change token
                  </Button>
                </div>
              </div>
            ) : data ? (
              <PipelineView
                items={items}
                filteredItems={filteredItems}
                emailToPs={emailToPs}
                vendorDomainToCompany={vendorDomainToCompany}
                sentRecipients={sentRecipients}
              />
            ) : (
              <PipelineSkeleton />
            )}
          </div>
        </div>

        <div className={cn(isMailTab ? "block" : "hidden")}>
          <PlaceTrackMailPanel active={isMailTab} registerToolbar={setMailToolbar} />
        </div>

        <Footer />
      </div>

      {isPipelineTab && needsGmailConnect ? (
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-[max(1rem,10vh)] backdrop-blur-sm sm:items-center sm:pt-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-xl"
          >
            <GmailConnectCard status={gmailStatus} isLoading={gmailLoading} onConnect={connectGmail} />
          </motion.div>
        </div>
      ) : null}

      {needsAuth ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/55 p-4 pt-[max(1rem,12vh)] backdrop-blur-sm sm:items-center sm:pt-4">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-xl"
          >
            <JwtAuthForm
              onUseSaved={useSavedToken}
              onFetchNew={fetchNewToken}
              isLoading={isLoading}
              error={error}
            />
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}

export default function PlaceTrackShell() {
  const { user } = useAuth();
  if (!user?.isAdmin) {
    return <PlaceTrackAdminDenied />;
  }
  return <PlaceTrackShellContent />;
}
