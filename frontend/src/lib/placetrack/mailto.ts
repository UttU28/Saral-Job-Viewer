export type ComposeMail = {
  to: string;
  cc?: string;
  subject: string;
  body: string;
};

export function buildMailtoUrl({ to, cc, subject, body }: ComposeMail): string {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  if (cc) params.set("cc", cc);
  const query = params.toString();
  return `mailto:${encodeURIComponent(to)}${query ? `?${query}` : ""}`;
}

/** Opens Gmail compose with pre-filled draft fields */
export function buildGmailComposeUrl({
  to,
  cc,
  subject,
  body,
}: ComposeMail): string {
  const params = new URLSearchParams();
  params.set("view", "cm");
  params.set("fs", "1");
  if (to) params.set("to", to);
  if (cc) params.set("cc", cc);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function openGmailDraft(mail: ComposeMail): void {
  window.open(buildGmailComposeUrl(mail), "_blank", "noopener,noreferrer");
}
