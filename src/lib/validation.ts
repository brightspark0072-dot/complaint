// Client-side validation. These bounds mirror the CHECK constraints in the database, which remain
// the real enforcement; this only gives users fast feedback.

export const LIMITS = {
  title: { min: 5, max: 120 },
  description: { min: 20, max: 5000 },
  location: { max: 160 },
  organization: { min: 2, max: 160 },
  message: { max: 2000 },
  fullName: { max: 120 },
  password: { min: 10, max: 72 },
  evidence: {
    maxBytes: 10 * 1024 * 1024,
    maxFiles: 10,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'] as const,
  },
} as const;

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | undefined {
  const v = email.trim();
  if (!v) return 'Enter your email address.';
  if (v.length > 254 || !EMAIL_RE.test(v)) return 'Enter a valid email address.';
  return undefined;
}

export function validateNewPassword(password: string): string | undefined {
  if (password.length < LIMITS.password.min)
    return `Use at least ${LIMITS.password.min} characters.`;
  if (password.length > LIMITS.password.max)
    return `Use at most ${LIMITS.password.max} characters.`;
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    return 'Include at least one letter and one number.';
  return undefined;
}

export interface ComplaintInput {
  categoryId: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description: string;
  location: string;
  acknowledgedPrivacy: boolean;
}

export function validateComplaint(i: ComplaintInput): FieldErrors<keyof ComplaintInput> {
  const e: FieldErrors<keyof ComplaintInput> = {};
  const title = i.title.trim();
  const description = i.description.trim();
  const org = i.organizationName.trim();
  if (!i.categoryId) e.categoryId = 'Choose a category.';
  if (!i.organizationId && org.length < LIMITS.organization.min)
    e.organizationName = 'Choose an organization or enter its name.';
  if (org.length > LIMITS.organization.max) e.organizationName = 'Organization name is too long.';
  if (title.length < LIMITS.title.min)
    e.title = `Title needs at least ${LIMITS.title.min} characters.`;
  else if (title.length > LIMITS.title.max)
    e.title = `Title must be at most ${LIMITS.title.max} characters.`;
  if (description.length < LIMITS.description.min)
    e.description = `Please describe the issue in at least ${LIMITS.description.min} characters.`;
  else if (description.length > LIMITS.description.max)
    e.description = `Description must be at most ${LIMITS.description.max} characters.`;
  if (i.location.trim().length > LIMITS.location.max) e.location = 'Location is too long.';
  if (!i.acknowledgedPrivacy)
    e.acknowledgedPrivacy = 'Please confirm you have read the privacy information.';
  return e;
}

export interface EvidenceFileInfo {
  name: string;
  size: number;
  type: string;
}

export function validateEvidenceFile(f: EvidenceFileInfo): string | undefined {
  if (f.size <= 0) return 'This file is empty.';
  if (f.size > LIMITS.evidence.maxBytes) return 'Files must be 10 MB or smaller.';
  if (!(LIMITS.evidence.mimeTypes as readonly string[]).includes(f.type))
    return 'Only JPEG, PNG, WebP, PDF or plain-text files are accepted.';
  return undefined;
}

/** Produces the storage object name `<complaint>/<random>-<safe name>` that the storage policy requires. */
export function evidenceObjectPath(
  complaintId: string,
  fileName: string,
  randomId: string,
): string {
  const dot = fileName.lastIndexOf('.');
  const ext =
    dot > 0
      ? fileName
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 8)
      : '';
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${complaintId}/${randomId}-${base || 'file'}${ext ? '.' + ext : ''}`;
}
