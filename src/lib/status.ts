import type { AppRole, ComplaintStatus } from './types.ts';

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  in_progress: 'In progress',
  awaiting_complainant: 'Awaiting your response',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
};

export interface Transition {
  from: ComplaintStatus;
  to: ComplaintStatus;
  role: AppRole;
  requiresMessage: boolean;
}

/**
 * UI MIRROR of the `status_transitions` table in supabase/migrations/…_schema.sql.
 * It only decides which buttons to show. The DATABASE is the authority and re-checks every transition;
 * status.test.ts fails if this table drifts from the SQL.
 */
export const TRANSITIONS: readonly Transition[] = [
  { from: 'submitted', to: 'under_review', role: 'handler', requiresMessage: false },
  { from: 'under_review', to: 'in_progress', role: 'handler', requiresMessage: false },
  { from: 'under_review', to: 'rejected', role: 'handler', requiresMessage: true },
  { from: 'in_progress', to: 'awaiting_complainant', role: 'handler', requiresMessage: true },
  { from: 'in_progress', to: 'resolved', role: 'handler', requiresMessage: true },
  { from: 'in_progress', to: 'rejected', role: 'handler', requiresMessage: true },
  { from: 'awaiting_complainant', to: 'in_progress', role: 'handler', requiresMessage: false },
  { from: 'resolved', to: 'closed', role: 'handler', requiresMessage: false },
  { from: 'awaiting_complainant', to: 'in_progress', role: 'complainant', requiresMessage: true },
  { from: 'resolved', to: 'in_progress', role: 'complainant', requiresMessage: true },
  { from: 'submitted', to: 'under_review', role: 'admin', requiresMessage: false },
  { from: 'under_review', to: 'in_progress', role: 'admin', requiresMessage: false },
  { from: 'under_review', to: 'rejected', role: 'admin', requiresMessage: true },
  { from: 'in_progress', to: 'awaiting_complainant', role: 'admin', requiresMessage: true },
  { from: 'in_progress', to: 'resolved', role: 'admin', requiresMessage: true },
  { from: 'in_progress', to: 'rejected', role: 'admin', requiresMessage: true },
  { from: 'awaiting_complainant', to: 'in_progress', role: 'admin', requiresMessage: false },
  { from: 'resolved', to: 'closed', role: 'admin', requiresMessage: false },
  { from: 'closed', to: 'in_progress', role: 'admin', requiresMessage: true },
  { from: 'rejected', to: 'under_review', role: 'admin', requiresMessage: true },
];

export function allowedTransitions(from: ComplaintStatus, role: AppRole): Transition[] {
  return TRANSITIONS.filter((t) => t.from === from && t.role === role);
}
