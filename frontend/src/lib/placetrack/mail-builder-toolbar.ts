export type MailBuilderToolbar = {
  subtitle: string;
  draftLoading: boolean;
  sendLoading: boolean;
  gmailConnected: boolean;
  onCreateDraft: () => void;
  onSend: () => void;
  onCopyLink: () => void;
  onOpenGmail: () => void;
};
