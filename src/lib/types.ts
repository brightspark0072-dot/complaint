export type AppRole = 'complainant' | 'handler' | 'admin';

export type ComplaintStatus =
  | 'submitted'
  | 'under_review'
  | 'in_progress'
  | 'awaiting_complainant'
  | 'resolved'
  | 'closed'
  | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: AppRole;
  is_suspended: boolean;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  org_type: string | null;
}

export interface Organization {
  id: string;
  name: string;
  type: string;
}

export interface Complaint {
  id: string;
  case_ref: string;
  complainant_id: string;
  category_id: string;
  subcategory_id: string | null;
  organization_id: string | null;
  organization_name: string;
  title: string;
  description: string;
  location: string | null;
  status: ComplaintStatus;
  resolution_summary: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintEvent {
  id: string;
  complaint_id: string;
  actor_id: string | null;
  event_type: string;
  from_status: ComplaintStatus | null;
  to_status: ComplaintStatus | null;
  message: string | null;
  visible_to_complainant: boolean;
  created_at: string;
}

export interface ComplaintComment {
  id: string;
  complaint_id: string;
  author_id: string;
  author_role: AppRole;
  body: string;
  created_at: string;
}

export interface InternalNote {
  id: string;
  complaint_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  complaint_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: 'pending_scan' | 'available' | 'quarantined';
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
