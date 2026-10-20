import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Empty, Spinner, StatusBadge, fmtDate } from '../components/ui.tsx';
import { evidenceUploadsEnabled, supabase } from '../lib/supabase.ts';
import { actionErrorMessage } from '../lib/errors.ts';
import { STATUS_LABEL, allowedTransitions } from '../lib/status.ts';
import { LIMITS, evidenceObjectPath, validateEvidenceFile } from '../lib/validation.ts';
import type {
  AppRole,
  Attachment,
  Complaint,
  ComplaintComment,
  ComplaintEvent,
  ComplaintStatus,
  InternalNote,
} from '../lib/types.ts';

interface Bundle {
  complaint: Complaint;
  events: ComplaintEvent[];
  comments: ComplaintComment[];
  notes: InternalNote[];
  attachments: Attachment[];
}

/**
 * One case screen for all three roles. What each role SEES is decided by RLS (e.g. complainants receive zero
 * internal notes even though the query is identical). What each role can DO is decided by the RPC functions.
 * The `viewer` prop only decides which controls to render.
 */
export function CaseView({ viewer }: { viewer: AppRole }) {
  const { id } = useParams();
  const [data, setData] = useState<Bundle>();
  const [error, setError] = useState<string>();
  const [flash, setFlash] = useState<string>();

  const load = useCallback(async () => {
    if (!id) return;
    const c = await supabase.from('complaints').select('*').eq('id', id).maybeSingle();
    if (c.error || !c.data) {
      setError(c.error ? actionErrorMessage(c.error) : 'That complaint could not be found.');
      return;
    }
    const [ev, cm, nt, at] = await Promise.all([
      supabase.from('complaint_events').select('*').eq('complaint_id', id).order('created_at'),
      supabase.from('complaint_comments').select('*').eq('complaint_id', id).order('created_at'),
      viewer === 'complainant'
        ? Promise.resolve({ data: [] as InternalNote[] })
        : supabase
            .from('complaint_internal_notes')
            .select('*')
            .eq('complaint_id', id)
            .order('created_at'),
      supabase.from('complaint_attachments').select('*').eq('complaint_id', id).order('created_at'),
    ]);
    setData({
      complaint: c.data as Complaint,
      events: (ev.data ?? []) as ComplaintEvent[],
      comments: (cm.data ?? []) as ComplaintComment[],
      notes: (nt.data ?? []) as InternalNote[],
      attachments: (at.data ?? []) as Attachment[],
    });
  }, [id, viewer]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const { complaint: c } = data;
  const back =
    viewer === 'complainant' ? '/app/complaints' : viewer === 'handler' ? '/handler' : '/admin';

  return (
    <>
      <p>
        <Link to={back}>← Back</Link>
      </p>
      <h1>{c.title}</h1>
      <p className="meta">
        {c.case_ref} · {c.organization_name} · submitted {fmtDate(c.created_at)}
      </p>
      <p>
        <StatusBadge status={c.status} />
      </p>
      {flash && <Alert kind="success">{flash}</Alert>}
      {viewer === 'complainant' && c.status === 'awaiting_complainant' && (
        <Alert kind="warn">
          The handler needs more information from you. Please respond below.
        </Alert>
      )}

      <div className="card">
        <h2>Details</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>
        {c.location && <p className="meta">Location: {c.location}</p>}
        {c.resolution_summary && (
          <Alert kind="success">
            <strong>Resolution:</strong> {c.resolution_summary}
          </Alert>
        )}
      </div>

      <TransitionPanel
        complaint={c}
        viewer={viewer}
        onDone={(m) => {
          setFlash(m);
          void load();
        }}
      />

      <div className="card">
        <h2>Updates</h2>
        {data.comments.length === 0 ? (
          <Empty title="No updates yet" />
        ) : (
          data.comments.map((m) => (
            <div className="comment" key={m.id}>
              <div className="meta">
                {m.author_role === 'complainant' ? 'Complainant' : 'Case handler'} ·{' '}
                {fmtDate(m.created_at)}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
          ))
        )}
        {viewer !== 'complainant' && (
          <NoteForm kind="public" id={c.id} onDone={() => void load()} />
        )}
      </div>

      {viewer !== 'complainant' && (
        <div className="card">
          <h2>
            Internal notes <span className="meta">(never shown to the complainant)</span>
          </h2>
          {data.notes.length === 0 ? (
            <Empty title="No internal notes" />
          ) : (
            data.notes.map((n) => (
              <div className="note" key={n.id}>
                <div className="meta">{fmtDate(n.created_at)}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
              </div>
            ))
          )}
          <NoteForm kind="internal" id={c.id} onDone={() => void load()} />
        </div>
      )}

      <Evidence
        complaint={c}
        attachments={data.attachments}
        viewer={viewer}
        onDone={() => void load()}
      />

      <div className="card">
        <h2>Timeline</h2>
        <ol className="timeline">
          {data.events.map((e) => (
            <li key={e.id}>
              <strong>{describeEvent(e)}</strong>
              <div className="meta">{fmtDate(e.created_at)}</div>
              {e.message && e.event_type !== 'internal_note' && <div>{e.message}</div>}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function describeEvent(e: ComplaintEvent): string {
  switch (e.event_type) {
    case 'submitted':
      return 'Complaint submitted';
    case 'status_changed':
      return `Status changed: ${e.from_status ? STATUS_LABEL[e.from_status] : ''} → ${e.to_status ? STATUS_LABEL[e.to_status] : ''}`;
    case 'complainant_response':
      return `Complainant responded: ${e.to_status ? STATUS_LABEL[e.to_status] : ''}`;
    case 'public_update':
      return 'Update posted';
    case 'assigned':
      return 'Case assigned';
    case 'internal_note':
      return 'Internal note added';
    case 'attachment_added':
      return 'Evidence added';
    default:
      return e.event_type;
  }
}

function TransitionPanel({
  complaint,
  viewer,
  onDone,
}: {
  complaint: Complaint;
  viewer: AppRole;
  onDone: (m: string) => void;
}) {
  const options = allowedTransitions(complaint.status, viewer);
  const [to, setTo] = useState<ComplaintStatus | ''>('');
  const [message, setMessage] = useState('');
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (options.length === 0) return null;
  const chosen = options.find((o) => o.to === to);
  const complainantLabel =
    complaint.status === 'resolved'
      ? 'Reopen this complaint'
      : 'Respond to the information request';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const target = viewer === 'complainant' ? options[0] : chosen;
    if (!target) return setError('Choose a new status.');
    if (target.requiresMessage && !message.trim()) return setError('A message is required.');
    if (target.to === 'resolved' && !resolution.trim())
      return setError('Enter a resolution summary.');
    setBusy(true);
    setError(undefined);
    const { error: err } = await supabase.rpc('transition_complaint', {
      p_complaint_id: complaint.id,
      p_to: target.to,
      p_message: message.trim() || null,
      p_resolution: resolution.trim() || null,
    });
    setBusy(false);
    if (err) return setError(actionErrorMessage(err));
    setMessage('');
    setResolution('');
    setTo('');
    onDone('Saved.');
  }

  return (
    <form className="card" onSubmit={(e) => void submit(e)}>
      <h2>{viewer === 'complainant' ? complainantLabel : 'Update status'}</h2>
      {error && <Alert>{error}</Alert>}
      {viewer !== 'complainant' && (
        <div className="field">
          <label htmlFor="to">New status</label>
          <select id="to" value={to} onChange={(e) => setTo(e.target.value as ComplaintStatus)}>
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.to} value={o.to}>
                {STATUS_LABEL[o.to]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="msg">
          Message{viewer !== 'complainant' && chosen?.requiresMessage ? ' (required)' : ''}
        </label>
        <textarea
          id="msg"
          maxLength={LIMITS.message.max}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {viewer !== 'complainant' && (
          <p className="hint">Shown to the complainant on the case timeline.</p>
        )}
      </div>
      {chosen?.to === 'resolved' && (
        <div className="field">
          <label htmlFor="res">Resolution summary (required)</label>
          <textarea
            id="res"
            maxLength={2000}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
        </div>
      )}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : viewer === 'complainant' ? 'Send' : 'Update status'}
      </button>
    </form>
  );
}

function NoteForm({
  kind,
  id,
  onDone,
}: {
  kind: 'public' | 'internal';
  id: string;
  onDone: () => void;
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setError('Write something first.');
    const fn = kind === 'public' ? 'add_public_update' : 'add_internal_note';
    const { error: err } = await supabase.rpc(fn, { p_complaint_id: id, p_body: body.trim() });
    if (err) return setError(actionErrorMessage(err));
    setBody('');
    setError(undefined);
    onDone();
  }
  const label = kind === 'public' ? 'Post a public update' : 'Add an internal note';
  return (
    <form onSubmit={(e) => void submit(e)} style={{ marginTop: '1rem' }}>
      {error && <Alert>{error}</Alert>}
      <div className="field">
        <label htmlFor={`note-${kind}`}>{label}</label>
        <textarea
          id={`note-${kind}`}
          maxLength={kind === 'public' ? 2000 : 4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <button className="btn">{label}</button>
    </form>
  );
}

function Evidence({
  complaint,
  attachments,
  viewer,
  onDone,
}: {
  complaint: Complaint;
  attachments: Attachment[];
  viewer: AppRole;
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canUpload =
    evidenceUploadsEnabled &&
    viewer === 'complainant' &&
    attachments.length < LIMITS.evidence.maxFiles;

  async function open(a: Attachment) {
    // Short-lived signed URL; the storage SELECT policy is re-checked when it is issued.
    const { data, error: err } = await supabase.storage
      .from('evidence')
      .createSignedUrl(a.storage_path, 60);
    if (err || !data) return setError('Could not open this file.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function upload(file: File) {
    const bad = validateEvidenceFile({ name: file.name, size: file.size, type: file.type });
    if (bad) return setError(bad);
    setBusy(true);
    setError(undefined);
    const path = evidenceObjectPath(complaint.id, file.name, crypto.randomUUID());
    const up = await supabase.storage
      .from('evidence')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) {
      setBusy(false);
      return setError('The file could not be uploaded.');
    }
    const reg = await supabase.rpc('register_attachment', {
      p_complaint_id: complaint.id,
      p_storage_path: path,
      p_original_name: file.name.slice(0, 200),
      p_mime_type: file.type,
      p_size_bytes: file.size,
    });
    setBusy(false);
    if (reg.error) return setError(actionErrorMessage(reg.error));
    onDone();
  }

  return (
    <div className="card">
      <h2>Evidence</h2>
      {error && <Alert>{error}</Alert>}
      {attachments.length === 0 ? (
        <Empty title="No files attached" />
      ) : (
        <ul className="list">
          {attachments.map((a) => (
            <li className="list-item" key={a.id}>
              <div>
                {a.original_name}
                <div className="meta">
                  {Math.ceil(a.size_bytes / 1024)} KB ·{' '}
                  {a.status === 'pending_scan' ? 'awaiting security scan' : a.status}
                </div>
              </div>
              {a.status !== 'quarantined' && (
                <button className="btn" onClick={() => void open(a)}>
                  Open
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload ? (
        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="file">Add a file (JPEG, PNG, WebP, PDF or text; up to 10 MB)</label>
          <input
            id="file"
            type="file"
            disabled={busy}
            accept={LIMITS.evidence.mimeTypes.join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </div>
      ) : viewer === 'complainant' && !evidenceUploadsEnabled ? (
        <p className="hint">Evidence uploads are not enabled yet.</p>
      ) : null}
    </div>
  );
}
