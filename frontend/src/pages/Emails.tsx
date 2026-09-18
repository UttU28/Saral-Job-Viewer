import { Footer } from "@/components/Footer";
import { PlaceTrackEmailsPanel } from "@/components/placetrack/PlaceTrackEmailsPanel";
import { useNoiseCategoryTrash } from "@/hooks/use-noise-category-trash";
import { useUnreadPrimaryEmails } from "@/hooks/use-unread-emails";

export default function EmailsPage() {
  const unreadInbox = useUnreadPrimaryEmails(true);
  const noiseTrash = useNoiseCategoryTrash(Boolean(unreadInbox.gmailStatus?.connected));

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <PlaceTrackEmailsPanel
          active
          gmailStatus={unreadInbox.gmailStatus}
          rows={unreadInbox.rows}
          mixCounts={unreadInbox.mixCounts}
          fetchedAt={unreadInbox.fetchedAt}
          isLoading={unreadInbox.isLoading}
          isFetchingPage={unreadInbox.isFetchingPage}
          isCategorizing={unreadInbox.isCategorizing}
          isSubmitting={unreadInbox.isSubmitting}
          categorizeProgress={unreadInbox.categorizeProgress}
          submitProgress={unreadInbox.submitProgress}
          currentPage={unreadInbox.currentPage}
          totalPages={unreadInbox.totalPages}
          total={unreadInbox.total}
          pageSize={unreadInbox.pageSize}
          canSubmitAll={unreadInbox.canSubmitAll}
          error={unreadInbox.error}
          lastApply={unreadInbox.lastApply}
          onRefresh={() => {
            void unreadInbox.refresh();
            void noiseTrash.refresh();
          }}
          onGoToPage={(page) => {
            void unreadInbox.goToPage(page);
          }}
          onCategorize={() => unreadInbox.categorizeAll()}
          onSetCategory={unreadInbox.setRowCategory}
          onSubmit={() => unreadInbox.submitLabels()}
          classifyProvider={unreadInbox.classifyProvider}
          effectiveProvider={unreadInbox.effectiveProvider}
          classifyAiStatus={unreadInbox.classifyAiStatus}
          onClassifyProviderChange={unreadInbox.setClassifyProvider}
          noiseCount={noiseTrash.counts}
          noiseLoading={noiseTrash.isLoading}
          noiseDeleting={noiseTrash.isDeleting}
          noiseError={noiseTrash.error}
          onDeleteNoise={() => noiseTrash.deleteAll()}
          isDisconnecting={unreadInbox.isDisconnecting}
          isMarkingUnread={unreadInbox.isMarkingUnread}
          onDisconnect={() => unreadInbox.disconnectAccount()}
          onMarkAllUnread={() => unreadInbox.markAllUnread()}
        />
        <Footer />
      </div>
    </div>
  );
}
