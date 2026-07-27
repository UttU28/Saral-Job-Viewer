import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  FileText,
  Link2,
  Loader2,
  Mail,
  Paperclip,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Unplug,
  Upload,
  User,
  X,
} from "lucide-react";
import { EmailBodyPreview } from "@/components/placetrack/EmailBodyPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useMailTemplates } from "@/hooks/use-mail-templates";
import { buildFinalEmailBody } from "@/lib/placetrack/email-format";
import {
  createGmailDraft,
  deleteResume,
  disconnectGmail,
  fetchGmailStatus,
  fetchResumeInfo,
  MailApiError,
  sendGmail,
  startGmailAuth,
  uploadResume,
  type GmailStatus,
  type ResumeInfo,
} from "@/lib/placetrack/mail-api";
import {
  getIncludeResume,
  getRecipientEmail,
  getRecipientName,
  getSenderEmail,
  MAIL_SENDER,
  saveIncludeResume,
  saveRecipientEmail,
  saveRecipientName,
  saveSenderEmail,
} from "@/lib/placetrack/mail-profile";
import {
  applyMailPlaceholders,
  formatRecipientSalutationName,
  getCategoryForTemplate,
  getDefaultTemplate,
  getTemplateById,
  isTemplateDraftDirty,
  saveMailTemplates,
  updateTemplateInConfig,
} from "@/lib/placetrack/mail-templates";
import { buildGmailComposeUrl, openGmailDraft } from "@/lib/placetrack/mailto";
import type { MailBuilderToolbar } from "@/lib/placetrack/mail-builder-toolbar";
import { clearMailBuilderQuery, PLACETRACK_MAIL_PATH, readMailBuilderParams } from "@/lib/placetrack/routing";
import { cn } from "@/lib/utils";

type PlaceTrackMailPanelProps = {
  active?: boolean;
  registerToolbar?: (toolbar: MailBuilderToolbar | null) => void;
};

export function PlaceTrackMailPanel({ active = true, registerToolbar }: PlaceTrackMailPanelProps) {
  const [location] = useLocation();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const { config: mailTemplatesConfig, isLoading: templatesLoading, applyConfig } = useMailTemplates();
  const templatesInitializedRef = useRef(false);
  const [templateId, setTemplateId] = useState("classic");
  const [recipientEmail, setRecipientEmail] = useState(getRecipientEmail);
  const [recipientName, setRecipientName] = useState(getRecipientName);
  const [senderEmail, setSenderEmail] = useState(getSenderEmail);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [includeResume, setIncludeResume] = useState(getIncludeResume);
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [draftLoading, setDraftLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  const selectedTemplate = useMemo(() => {
    if (!mailTemplatesConfig) return undefined;
    return getTemplateById(mailTemplatesConfig, templateId) ?? getDefaultTemplate(mailTemplatesConfig);
  }, [mailTemplatesConfig, templateId]);

  const selectedCategory = useMemo(() => {
    if (!mailTemplatesConfig || !selectedTemplate) return undefined;
    return getCategoryForTemplate(mailTemplatesConfig, selectedTemplate);
  }, [mailTemplatesConfig, selectedTemplate]);

  const templateSummary = useMemo(() => {
    if (!mailTemplatesConfig) return "Loading templates…";
    const names = mailTemplatesConfig.templates.map((template) => template.name);
    const categoryName = mailTemplatesConfig.categories[0]?.name;
    if (categoryName && names.length) {
      return `${categoryName} · ${names.join(" or ")} · Gmail API drafts & send`;
    }
    return `${names.join(" or ")} · Gmail API drafts & send`;
  }, [mailTemplatesConfig]);

  const templateDirty = useMemo(
    () => isTemplateDraftDirty(selectedTemplate, subject, body),
    [selectedTemplate, subject, body],
  );

  useEffect(() => {
    if (!mailTemplatesConfig || templatesInitializedRef.current) return;
    const defaultTemplate = getDefaultTemplate(mailTemplatesConfig);
    if (!defaultTemplate) return;
    templatesInitializedRef.current = true;
    setTemplateId(defaultTemplate.id);
    setSubject(defaultTemplate.subject);
    setBody(defaultTemplate.body);
  }, [mailTemplatesConfig]);

  const syncBodyHeight = useCallback(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.max(node.scrollHeight, 320)}px`;
  }, []);

  useEffect(() => {
    if (!showPreview) {
      syncBodyHeight();
    }
  }, [body, showPreview, syncBodyHeight]);

  const loadGmailStatus = async () => {
    setStatusLoading(true);
    try {
      setGmailStatus(await fetchGmailStatus());
    } catch {
      setGmailStatus({ configured: false, connected: false, email: null });
    } finally {
      setStatusLoading(false);
    }
  };

  const loadResumeInfo = async () => {
    setResumeLoading(true);
    try {
      setResumeInfo(await fetchResumeInfo());
    } catch {
      setResumeInfo({ saved: false, filename: null, path: null });
    } finally {
      setResumeLoading(false);
    }
  };

  useEffect(() => {
    void loadGmailStatus();
    void loadResumeInfo();
  }, []);

  useEffect(() => {
    const { to, name, gmailConnected } = readMailBuilderParams(location);

    if (to) {
      setRecipientEmail(to);
      saveRecipientEmail(to);
    }
    if (name) {
      setRecipientName(name);
      saveRecipientName(name);
    }
    if (gmailConnected) {
      toast({ title: "Gmail connected", description: "You can create drafts from here." });
      void loadGmailStatus();
    }
    if (to || name || gmailConnected) {
      clearMailBuilderQuery();
    }
  }, [location]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setSubject(selectedTemplate.subject);
    setBody(selectedTemplate.body);
  }, [selectedTemplate]);

  const resolvedBody = useMemo(() => {
    const withPlaceholders = applyMailPlaceholders(body, recipientName);
    return buildFinalEmailBody(withPlaceholders);
  }, [body, recipientName]);

  const resolvedSubject = useMemo(
    () => applyMailPlaceholders(subject, recipientName),
    [subject, recipientName],
  );

  const composeMail = useMemo(
    () => ({
      to: recipientEmail.trim(),
      subject: resolvedSubject,
      body: resolvedBody,
    }),
    [recipientEmail, resolvedSubject, resolvedBody],
  );

  const mailPayload = useMemo(
    () => ({
      to: recipientEmail.trim(),
      subject: resolvedSubject,
      body: resolvedBody,
      recipient_name: recipientName.trim() || undefined,
      sender_name: MAIL_SENDER.name,
      sender_email: senderEmail.trim() || undefined,
      include_resume: includeResume,
    }),
    [recipientEmail, resolvedSubject, resolvedBody, recipientName, senderEmail, includeResume],
  );

  const gmailUrl = buildGmailComposeUrl(composeMail);

  const requireRecipient = (): boolean => {
    if (recipientEmail.trim()) return true;
    toast({
      title: "Recipient required",
      description: "Enter a recipient email first.",
      variant: "destructive",
    });
    return false;
  };

  const handleCreateDraft = async () => {
    if (!requireRecipient()) return;
    if (!gmailStatus?.connected) {
      toast({
        title: "Gmail not connected",
        description: "Connect Gmail first.",
        variant: "destructive",
      });
      return;
    }

    setDraftLoading(true);
    try {
      const result = await createGmailDraft(mailPayload);
      const count = result.attachmentsCount ?? result.attachments_count ?? 0;
      toast({
        title: "Draft created",
        description: `Saved to Gmail${count ? ` with ${count} attachment(s)` : ""}.`,
      });
    } catch (error) {
      const message = error instanceof MailApiError ? error.message : "Could not create draft.";
      toast({ title: "Draft failed", description: message, variant: "destructive" });
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSend = async () => {
    if (!requireRecipient()) return;
    if (!gmailStatus?.connected) {
      toast({
        title: "Gmail not connected",
        description: "Connect Gmail first.",
        variant: "destructive",
      });
      return;
    }

    setSendLoading(true);
    try {
      await sendGmail(mailPayload);
      toast({
        title: "Email sent",
        description: `Message sent to ${recipientEmail.trim()}.`,
      });
    } catch (error) {
      const message = error instanceof MailApiError ? error.message : "Could not send email.";
      toast({ title: "Send failed", description: message, variant: "destructive" });
    } finally {
      setSendLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectGmail();
      await loadGmailStatus();
      toast({ title: "Disconnected", description: "Gmail account removed from server." });
    } catch (error) {
      const message = error instanceof MailApiError ? error.message : "Could not disconnect.";
      toast({ title: "Disconnect failed", description: message, variant: "destructive" });
    }
  };

  const handleOpenGmail = () => {
    if (!requireRecipient()) return;
    openGmailDraft(composeMail);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(gmailUrl);
      toast({ title: "Copied", description: "Gmail compose link copied." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy link.", variant: "destructive" });
    }
  };

  const handleSaveSender = () => {
    saveSenderEmail(senderEmail);
    toast({ title: "Saved", description: "Sender email saved locally." });
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setResumeUploading(true);
    try {
      const info = await uploadResume(file);
      setResumeInfo(info);
      setIncludeResume(true);
      saveIncludeResume(true);
      toast({ title: "Resume saved", description: "Will attach to every draft/send." });
    } catch (error) {
      const message = error instanceof MailApiError ? error.message : "Could not save resume.";
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setResumeUploading(false);
      event.target.value = "";
    }
  };

  const handleResumeRemove = async () => {
    try {
      await deleteResume();
      setResumeInfo({ saved: false, filename: null, path: null });
      toast({ title: "Resume removed" });
    } catch (error) {
      const message = error instanceof MailApiError ? error.message : "Could not remove resume.";
      toast({ title: "Remove failed", description: message, variant: "destructive" });
    }
  };

  const resumeSavedLabel = useMemo(() => {
    if (!resumeInfo?.savedAt) return null;
    try {
      return new Date(resumeInfo.savedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }, [resumeInfo?.savedAt]);

  const openResumePicker = () => {
    resumeInputRef.current?.click();
  };

  const handleSelectTemplate = (nextTemplateId: string) => {
    if (nextTemplateId === templateId) return;
    if (templateDirty) {
      toast({
        title: "Changes discarded",
        description: "Switching templates reverts unsaved edits.",
      });
    }
    setTemplateId(nextTemplateId);
  };

  const handleCancelTemplate = () => {
    if (!selectedTemplate) return;
    setSubject(selectedTemplate.subject);
    setBody(selectedTemplate.body);
  };

  const handleSaveTemplate = async () => {
    if (!mailTemplatesConfig || !selectedTemplate || !templateDirty) return;

    setTemplateSaving(true);
    try {
      const nextConfig = updateTemplateInConfig(mailTemplatesConfig, selectedTemplate.id, { subject, body });
      const saved = await saveMailTemplates(nextConfig);
      applyConfig(saved);
      toast({
        title: "Template saved",
        description: `${selectedTemplate.name} updated in MongoDB.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save template.";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setTemplateSaving(false);
    }
  };

  const toolbarHandlersRef = useRef({
    handleCreateDraft: async () => {},
    handleSend: async () => {},
    handleCopyLink: async () => {},
    handleOpenGmail: () => {},
  });

  toolbarHandlersRef.current = {
    handleCreateDraft,
    handleSend,
    handleCopyLink,
    handleOpenGmail,
  };

  useEffect(() => {
    if (!active || !registerToolbar) {
      registerToolbar?.(null);
      return;
    }

    registerToolbar({
      subtitle: templateSummary,
      draftLoading,
      sendLoading,
      gmailConnected: Boolean(gmailStatus?.connected),
      onCreateDraft: () => void toolbarHandlersRef.current.handleCreateDraft(),
      onSend: () => void toolbarHandlersRef.current.handleSend(),
      onCopyLink: () => void toolbarHandlersRef.current.handleCopyLink(),
      onOpenGmail: () => toolbarHandlersRef.current.handleOpenGmail(),
    });

    return () => registerToolbar(null);
  }, [
    active,
    registerToolbar,
    templateSummary,
    draftLoading,
    sendLoading,
    gmailStatus?.connected,
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
          <div className="glass-card overflow-hidden rounded-xl border border-white/10">
            <div className="grid items-start lg:grid-cols-[280px_1fr]">
              <div className="space-y-4 border-b border-white/8 p-4 lg:border-b-0 lg:border-r">
                <Card className="border-white/8 bg-black/15 shadow-none">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" />
                      Gmail
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-3">
                    {statusLoading ? (
                      <p className="text-xs text-muted-foreground">Checking connection…</p>
                    ) : gmailStatus?.connected ? (
                      <>
                        <p className="text-xs text-primary/90">Connected as {gmailStatus.email}</p>
                        <Button variant="outline" size="sm" className="h-7 w-full gap-1.5 text-[11px]" onClick={handleDisconnect}>
                          <Unplug className="h-3 w-3" />
                          Disconnect
                        </Button>
                      </>
                    ) : gmailStatus?.configured ? (
                      <Button size="sm" className="h-8 w-full text-xs" onClick={() => startGmailAuth(PLACETRACK_MAIL_PATH)}>
                        Connect Gmail
                      </Button>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Backend missing <code className="text-primary/80">client_secret.json</code>.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/8 bg-black/15 shadow-none">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      Sender & recipient
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-3">
                    <div className="rounded-md border border-white/8 bg-black/20 px-3 py-2">
                      <p className="text-sm font-medium">{MAIL_SENDER.name}</p>
                      <p className="text-xs text-muted-foreground">{MAIL_SENDER.title}</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sender-email" className="text-xs">
                        Your email
                      </Label>
                      <div className="flex gap-1.5">
                        <Input
                          id="sender-email"
                          type="email"
                          placeholder="you@email.com"
                          value={senderEmail}
                          onChange={(event) => setSenderEmail(event.target.value)}
                          className="h-8 text-xs"
                        />
                        <Button variant="outline" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={handleSaveSender}>
                          Save
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="recipient-email" className="text-xs">
                        To
                      </Label>
                      <Input
                        id="recipient-email"
                        type="email"
                        placeholder="recruiter@company.com"
                        value={recipientEmail}
                        onChange={(event) => {
                          setRecipientEmail(event.target.value);
                          saveRecipientEmail(event.target.value);
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="recipient-name" className="text-xs">
                        Recipient name
                      </Label>
                      <Input
                        id="recipient-name"
                        placeholder="Jane"
                        value={recipientName}
                        onChange={(event) => {
                          setRecipientName(event.target.value);
                          saveRecipientName(event.target.value);
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/8 bg-black/15 shadow-none">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />
                      Resume
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-3">
                    <input
                      ref={resumeInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={handleResumeUpload}
                      disabled={resumeUploading}
                      className="sr-only"
                    />

                    {resumeLoading ? (
                      <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-black/20 px-3 py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Loading resume…</p>
                      </div>
                    ) : resumeInfo?.saved ? (
                      <>
                        <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-tight">{resumeInfo.filename}</p>
                            {resumeSavedLabel ? (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">Saved {resumeSavedLabel}</p>
                            ) : (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">Stored in MongoDB</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                          <Label
                            htmlFor="include-resume"
                            className="cursor-pointer text-xs font-normal leading-none text-muted-foreground"
                          >
                            Attach to every email
                          </Label>
                          <Switch
                            id="include-resume"
                            checked={includeResume}
                            onCheckedChange={(checked) => {
                              setIncludeResume(checked);
                              saveIncludeResume(checked);
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={openResumePicker}
                            disabled={resumeUploading}
                          >
                            {resumeUploading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Replace
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={handleResumeRemove}
                            disabled={resumeUploading}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={openResumePicker}
                          disabled={resumeUploading}
                          className={cn(
                            "flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-black/10 px-4 py-5 transition-colors",
                            "hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60",
                          )}
                        >
                          {resumeUploading ? (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          ) : (
                            <Upload className="h-5 w-5 text-muted-foreground" />
                          )}
                          <span className="text-xs font-medium text-foreground">
                            {resumeUploading ? "Uploading…" : "Upload resume"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">PDF, DOC, or DOCX</span>
                        </button>
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          Upload once — stored in MongoDB and reused for all drafts and sends.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/8 bg-black/15 shadow-none">
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {selectedCategory ? `${selectedCategory.name} · Style` : "Style"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-3">
                    <div className="flex rounded-lg border border-white/10 bg-black/20 p-0.5">
                      {(mailTemplatesConfig?.templates ?? []).map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleSelectTemplate(template.id)}
                          disabled={templatesLoading}
                          title={template.description ?? template.name}
                          className={cn(
                            "flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors",
                            templateId === template.id
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                          )}
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                    {selectedTemplate?.description ? (
                      <p className="px-0.5 text-[10px] leading-relaxed text-muted-foreground">
                        {selectedTemplate.description}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col p-4">
                <div className="mb-3 space-y-2 rounded-lg border border-white/8 bg-black/20 px-3 py-2.5">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <span className="text-foreground/50">From </span>
                      {MAIL_SENDER.name}
                      {senderEmail ? ` <${senderEmail}>` : ""}
                    </span>
                    <span>
                      <span className="text-foreground/50">To </span>
                      {recipientEmail || "—"}
                      {recipientName ? ` (${recipientName})` : ""}
                    </span>
                  </div>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Subject"
                    className="h-8 border-white/10 bg-transparent text-sm font-medium"
                  />
                </div>

                {templateDirty ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <p className="text-xs text-amber-100/90">
                      Unsaved changes to <span className="font-medium">{selectedTemplate?.name ?? "template"}</span>
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 px-2.5 text-xs"
                        onClick={handleCancelTemplate}
                        disabled={templateSaving}
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 gap-1.5 px-2.5 text-xs"
                        onClick={() => void handleSaveTemplate()}
                        disabled={templateSaving}
                      >
                        {templateSaving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Save template
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="mb-2 flex items-center justify-between">
                  <div className="flex rounded-lg border border-white/10 p-0.5">
                    <button
                      type="button"
                      onClick={() => setShowPreview(false)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                        !showPreview ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPreview(true)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                        showPreview ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Mail className="h-3 w-3" />
                      Preview
                    </button>
                  </div>
                  {!showPreview ? (
                    <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                      <Link2 className="h-3 w-3" />
                      Labels plain · URLs hyperlinked
                    </span>
                  ) : null}
                </div>

                <div className="rounded-lg border border-white/10 bg-black/25">
                  {showPreview ? (
                    <div className="min-h-[320px] p-4">
                      <p className="mb-3 border-b border-white/8 pb-2 text-sm font-medium">{resolvedSubject}</p>
                      <EmailBodyPreview
                        text={resolvedBody}
                        className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90"
                      />
                    </div>
                  ) : (
                    <Textarea
                      ref={bodyRef}
                      id="body"
                      value={body}
                      onChange={(event) => {
                        setBody(event.target.value);
                        requestAnimationFrame(syncBodyHeight);
                      }}
                      className="min-h-[320px] w-full resize-none overflow-hidden rounded-none border-0 bg-transparent font-mono text-sm leading-relaxed focus-visible:ring-0"
                    />
                  )}
                </div>

                {!showPreview ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    <code className="text-primary/80">[Recipient Name]</code> →{" "}
                    {formatRecipientSalutationName(recipientName)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
    </div>
  );
}
