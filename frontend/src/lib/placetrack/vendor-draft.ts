import type { MailApiPayload } from "@/lib/placetrack/mail-api";
import { buildFinalEmailBody } from "@/lib/placetrack/email-format";
import { getSenderEmail, MAIL_SENDER, saveRecipientEmail, saveRecipientName } from "@/lib/placetrack/mail-profile";
import {
  applyMailPlaceholders,
  fetchMailTemplates,
  getTemplateById,
  type MailTemplatesConfig,
} from "@/lib/placetrack/mail-templates";

export function buildVendorClassicDraftPayloadFromConfig(
  config: MailTemplatesConfig,
  email: string,
  name?: string,
): MailApiPayload {
  const template = getTemplateById(config, "classic") ?? config.templates[0];
  const recipientName = (name ?? "").trim();
  const subject = applyMailPlaceholders(template.subject, recipientName);
  const body = buildFinalEmailBody(applyMailPlaceholders(template.body, recipientName));

  return {
    to: email.trim(),
    subject,
    body,
    recipient_name: recipientName || undefined,
    sender_name: MAIL_SENDER.name,
    sender_email: getSenderEmail() || undefined,
    include_resume: true,
  };
}

export async function buildVendorClassicDraftPayload(email: string, name?: string): Promise<MailApiPayload> {
  const config = await fetchMailTemplates();
  return buildVendorClassicDraftPayloadFromConfig(config, email, name);
}

export function rememberVendorRecipient(email: string, name?: string): void {
  saveRecipientEmail(email.trim());
  saveRecipientName((name ?? "").trim());
}
