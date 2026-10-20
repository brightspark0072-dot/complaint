import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, Field, Spinner, StatusBadge, fmtDate } from '../../components/ui.tsx';
import { supabase } from '../../lib/supabase.ts';
import { actionErrorMessage } from '../../lib/errors.ts';
import { validateEmail } from '../../lib/validation.ts';
import type { AuditLog, Complaint, Organization, Profile } from '../../lib/types.ts';

type Handler = Pick<Profile, 'id' | 'email' | 'full_name' | 'is_suspended'>;

export function Cases() {
  const [rows, setRows] = useState<Complaint[]>();
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [error, setError] = useState<string>();
  const [ok, setOk] = useState<string>();

  const load = useCallback(async () => {
    const [c, a, h] = await Promise.all([
      supabase.from('complaints').select('*').order('created_at', { ascending: false }).limit(200),
      supabase
        .from('complaint_assignments')
        .select('complaint_id,handler_id')
        .is('unassigned_at', null),
      supabase
        .from('profiles')
        .select('id,email,full_name,is_suspended')
        .eq('role', 'handler')
        .eq('is_suspended', false),
    ]);
    if (c.error) return setError(actionErrorMessage(c.error));
    setRows((c.data ?? []) as Complaint[]);
    setAssigned(
      Object.fromEntries(
        (a.data ?? []).map((r) => [r.complaint_id as string, r.handler_id as string]),
      ),
    );
    setHandlers((h.data ?? []) as Handler[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function assign(complaintId: string, handlerId: string) {
    if (!handlerId) return;
    setError(undefined);
    const { error: err } = await supabase.rpc('assign_complaint', {
      p_complaint_id: complaintId,
      p_handler_id: handlerId,
    });
    if (err) return setError(actionErrorMessage(err));
    setOk('Assignment saved.');
    void load();
  }

  if (!rows) return error ? <Alert>{error}</Alert> : <Spinner />;
  return (
    <>
      <h1>Cases &amp; assignment</h1>
      {error && <Alert>{error}</Alert>}
      {ok && <Alert kind="success">{ok}</Alert>}
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <Empty title="No complaints yet" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Status</th>
                <th>Assigned handler</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/admin/cases/${r.id}`}>{r.title}</Link>
                    <div className="meta">
                      {r.case_ref} · {fmtDate(r.created_at)}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    <select
                      aria-label={`Assign ${r.case_ref}`}
                      value={assigned[r.id] ?? ''}
                      onChange={(e) => void assign(r.id, e.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {handlers.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.full_name || h.email}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function Staff() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [staff, setStaff] = useState<Handler[]>([]);
  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState('');
  const [scope, setScope] = useState<'assigned_only' | 'organization'>('assigned_only');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string }>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [o, s] = await Promise.all([
      supabase.from('organizations').select('id,name,type').eq('is_active', true).order('name'),
      supabase
        .from('profiles')
        .select('id,email,full_name,is_suspended')
        .eq('role', 'handler')
        .order('email'),
    ]);
    setOrgs((o.data ?? []) as Organization[]);
    setStaff((s.data ?? []) as Handler[]);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    const bad = validateEmail(email) ?? (orgId ? undefined : 'Choose an organization.');
    if (bad) return setMsg({ kind: 'error', text: bad });
    setBusy(true);
    // Performed by an Edge Function that re-verifies the caller is an active admin and holds the service key.
    const { error } = await supabase.functions.invoke('invite-handler', {
      body: { email: email.trim(), organizationId: orgId, scope },
    });
    setBusy(false);
    if (error)
      return setMsg({
        kind: 'error',
        text: 'The invitation could not be sent. Check the email address and try again.',
      });
    setMsg({ kind: 'success', text: 'Invitation sent.' });
    setEmail('');
    void load();
  }

  async function setSuspended(id: string, suspended: boolean) {
    const { error } = await supabase.functions.invoke('set-user-suspended', {
      body: { userId: id, suspended },
    });
    setMsg(
      error
        ? { kind: 'error', text: 'That change could not be made.' }
        : { kind: 'success', text: suspended ? 'Access suspended.' : 'Access restored.' },
    );
    void load();
  }

  return (
    <>
      <h1>Staff</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <form className="card" onSubmit={(e) => void invite(e)} noValidate>
        <h2>Invite a handler</h2>
        <Field label="Email" htmlFor="inv-email">
          <input
            id="inv-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Organization" htmlFor="inv-org">
          <select id="inv-org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">Choose…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Access scope"
          htmlFor="inv-scope"
          hint="“Assigned only” limits the handler to cases you assign. “Organization” also grants that organization's cases."
        >
          <select
            id="inv-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as 'assigned_only' | 'organization')}
          >
            <option value="assigned_only">Assigned cases only</option>
            <option value="organization">All cases of the organization</option>
          </select>
        </Field>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send invitation'}
        </button>
      </form>
      <div className="card table-wrap">
        <h2>Handlers</h2>
        {staff.length === 0 ? (
          <Empty title="No handlers yet" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.full_name || '—'}
                    <div className="meta">{s.email}</div>
                  </td>
                  <td>{s.is_suspended ? 'Suspended' : 'Active'}</td>
                  <td>
                    <button
                      className={`btn ${s.is_suspended ? '' : 'btn-danger'}`}
                      onClick={() => void setSuspended(s.id, !s.is_suspended)}
                    >
                      {s.is_suspended ? 'Restore access' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function Audit() {
  const [rows, setRows] = useState<AuditLog[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data, error: e }) =>
        e ? setError(actionErrorMessage(e)) : setRows((data ?? []) as AuditLog[]),
      );
  }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!rows) return <Spinner />;
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">Append-only record of significant actions. Latest 200 entries.</p>
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <Empty title="No entries" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Target</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{r.action}</td>
                  <td>
                    {r.target_type}
                    <div className="meta">{r.target_id}</div>
                  </td>
                  <td className="meta">{r.actor_id ?? 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
