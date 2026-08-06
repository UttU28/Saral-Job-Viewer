import { useAuth } from "@/auth/AuthProvider";
import { Footer } from "@/components/Footer";
import { PlaceTrackEmailsPanel } from "@/components/placetrack/PlaceTrackEmailsPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useNoiseCategoryTrash } from "@/hooks/use-noise-category-trash";
import { useUnreadPrimaryEmails } from "@/hooks/use-unread-emails";

export default function EmailsPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const unreadInbox = useUnreadPrimaryEmails(isAdmin);
  const noiseTrash = useNoiseCategoryTrash(isAdmin && Boolean(unreadInbox.gmailStatus?.connected));

  if (!isAdmin) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
          <div className="flex flex-col">
            <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 min-w-0">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Admin access required</AlertTitle>
                <AlertDescription>
                  Emails is only visible to users with admin access.
                </AlertDescription>
              </Alert>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <PlaceTrackEmailsPanel
          active
          gmailStatus={unreadInbox.gmailStatus}
          rows={unreadInbox.rows}
          fetchedAt={unreadInbox.fetchedAt}
          isLoading={unreadInbox.isLoading}
          isCategorizing={unreadInbox.isCategorizing}
          isSubmitting={unreadInbox.isSubmitting}
          categorizeProgress={unreadInbox.categorizeProgress}
          error={unreadInbox.error}
          lastApply={unreadInbox.lastApply}
          onRefresh={() => {
            void unreadInbox.refresh();
            void noiseTrash.refresh();
          }}
          onCategorize={() => unreadInbox.categorizeAll()}
          onSetCategory={unreadInbox.setRowCategory}
          onSubmit={() => unreadInbox.submitLabels()}
          noiseCount={noiseTrash.counts}
          noiseLoading={noiseTrash.isLoading}
          noiseDeleting={noiseTrash.isDeleting}
          noiseError={noiseTrash.error}
          onDeleteNoise={() => noiseTrash.deleteAll()}
        />
        <Footer />
      </div>
    </div>
  );
}
