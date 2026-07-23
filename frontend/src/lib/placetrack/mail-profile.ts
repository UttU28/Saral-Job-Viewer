export const MAIL_SENDER = {
  name: "Utsav Chaudhary",
  title: "DevOps Engineer",
  email: "utsavmaan28@gmail.com",
  phone: "(607) 296-9583",
  portfolio: "https://thatinsaneguy.com",
  linkedin: "https://www.linkedin.com/in/utsavmaan28/",
  github: "https://github.com/UttU28/",
};

export const DEFAULT_SUBJECT =
  "DevOps Engineer - Open to C2C & W2 Opportunities";

export const DEFAULT_RECIPIENT = {
  email: "aa@gmail.com",
  name: "Aa",
};

const STORAGE = {
  senderEmail: "mail_sender_email",
  includeResume: "mail_include_resume",
  recipientEmail: "mail_recipient_email",
  recipientName: "mail_recipient_name",
};

export function getSenderEmail(): string {
  try {
    return localStorage.getItem(STORAGE.senderEmail) ?? MAIL_SENDER.email;
  } catch {
    return MAIL_SENDER.email;
  }
}

export function saveSenderEmail(email: string): void {
  localStorage.setItem(STORAGE.senderEmail, email.trim());
}

export function getIncludeResume(): boolean {
  try {
    return localStorage.getItem(STORAGE.includeResume) !== "false";
  } catch {
    return true;
  }
}

export function saveIncludeResume(include: boolean): void {
  localStorage.setItem(STORAGE.includeResume, String(include));
}

export function getRecipientEmail(): string {
  try {
    const saved = localStorage.getItem(STORAGE.recipientEmail)?.trim();
    return saved || DEFAULT_RECIPIENT.email;
  } catch {
    return DEFAULT_RECIPIENT.email;
  }
}

export function saveRecipientEmail(email: string): void {
  localStorage.setItem(STORAGE.recipientEmail, email.trim());
}

export function getRecipientName(): string {
  try {
    const saved = localStorage.getItem(STORAGE.recipientName)?.trim();
    return saved || DEFAULT_RECIPIENT.name;
  } catch {
    return DEFAULT_RECIPIENT.name;
  }
}

export function saveRecipientName(name: string): void {
  localStorage.setItem(STORAGE.recipientName, name.trim());
}
