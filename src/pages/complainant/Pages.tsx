import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.tsx';
import { Alert, Empty, Field, Spinner, StatusBadge, fmtDate } from '../../components/ui.tsx';
import { supabase } from '../../lib/supabase.ts';
import { actionErrorMessage } from '../../lib/errors.ts';
import { validateComplaint, LIMITS } from '../../lib/validation.ts';
import type { Category, Complaint, Organization, ComplaintStatus } from '../../lib/types.ts';
import { STATUS_LABEL } from '../../lib/status.ts';

export function Dashboard() {
  const { profile } = useAuth();
  const [rows, setRows] =
    useState<Pick<Complaint, 'id' | 'case_ref' | 'title' | 'status' | 'created_at'>[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void supabase
      .from('complaints')
      .select('id,case_ref,title,status,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error: e }) => (e ? setError(actionErrorMessage(e)) : setRows(data ?? [])));
  }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!rows) return <Spinner />;
  const count = (f: (s: ComplaintStatus) => boolean) => rows.filter((r) => f(r.status)).length;
  const awaiting = rows.filter((r) => r.status === 'awaiting_complainant');
  return (
    <>
      <h1>Hello{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
      <p className="lead">Submit a new complaint or follow an existing one.</p>
      <p>
        <Link className="btn btn-primary" to="/app/new">
          Submit a complaint
        </Link>
      </p>
      {awaiting.length > 0 && (
        <Alert kind="warn">
          {awaiting.length} case{awaiting.length > 1 ? 's need' : ' needs'} your response:{' '}
          {awaiting.map((a) => (
            <Link key={a.id} to={`/app/complaints/${a.id}`}>
              {a.case_ref}{' '}
            </Link>
          ))}
        </Alert>
      )}
      <div className="grid grid-3">
        <div className="card">
          <div className="stat">{rows.length}</div>Total
        </div>
        <div className="card">
          <div className="stat">
            {count((s) =>
              ['submitted', 'under_review', 'in_progress', 'awaiting_complainant'].includes(s),
            )}
          </div>
          Open
        </div>
        <div className="card">
          <div className="stat">{count((s) => s === 'resolved' || s === 'closed')}</div>Resolved
        </div>
      </div>
      <h2>Recent</h2>
      <div className="card">
        {rows.length === 0 ? (
          <Empty title="No complaints yet">Submit your first complaint to get started.</Empty>
        ) : (
          <ul className="list">
            {rows.slice(0, 5).map((r) => (
              <li className="list-item" key={r.id}>
                <div>
                  <Link to={`/app/complaints/${r.id}`}>{r.title}</Link>
                  <div className="meta">
                    {r.case_ref} · {fmtDate(r.created_at)}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function MyComplaints() {
  const [rows, setRows] = useState<Complaint[]>();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string>();
  useEffect(() => {
    void supabase
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: e }) =>
        e ? setError(actionErrorMessage(e)) : setRows((data ?? []) as Complaint[]),
      );
  }, []);
  const shown = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (!status || r.status === status) &&
          (!q || `${r.title} ${r.case_ref}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, q, status],
  );
  if (error) return <Alert>{error}</Alert>;
  if (!rows) return <Spinner />;
  return (
    <>
      <h1>My complaints</h1>
      <div className="filters">
        <input
          aria-label="Search by title or reference"
          placeholder="Search by title or reference"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="card">
        {shown.length === 0 ? (
          <Empty title="No complaints found">
            Try changing the filters, or submit a new complaint.
          </Empty>
        ) : (
          <ul className="list">
            {shown.map((r) => (
              <li className="list-item" key={r.id}>
                <div>
                  <Link to={`/app/complaints/${r.id}`}>{r.title}</Link>
                  <div className="meta">
                    {r.case_ref} · {r.organization_name} · {fmtDate(r.created_at)}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function SubmitComplaint() {
  const [cats, setCats] = useState<Category[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [f, setF] = useState({
    categoryId: '',
    subcategoryId: '',
    organizationId: '',
    organizationName: '',
    title: '',
    description: '',
    location: '',
    acknowledgedPrivacy: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; case_ref: string }>();

  useEffect(() => {
    void supabase
      .from('complaint_categories')
      .select('id,parent_id,name,org_type')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setCats((data ?? []) as Category[]));
    void supabase
      .from('organizations')
      .select('id,name,type')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setOrgs((data ?? []) as Organization[]));
  }, []);
  const parents = cats.filter((c) => !c.parent_id);
  const subs = cats.filter((c) => c.parent_id === f.categoryId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const errs = validateComplaint(f);
    setErrors(errs as Record<string, string>);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('submit_complaint', {
      p_category_id: f.categoryId,
      p_subcategory_id: f.subcategoryId || null,
      p_organization_id: f.organizationId || null,
      p_organization_name: f.organizationName || null,
      p_title: f.title,
      p_description: f.description,
      p_location: f.location || null,
    });
    setBusy(false);
    if (error) return setFormError(actionErrorMessage(error));
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; case_ref: string };
    setDone(row);
  }

  if (done)
    return (
      <>
        <h1>Complaint submitted</h1>
        <Alert kind="success">
          Your case reference is <strong>{done.case_ref}</strong>. Keep it for your records.
        </Alert>
        <div className="btn-row">
          <Link className="btn btn-primary" to={`/app/complaints/${done.id}`}>
            View your complaint
          </Link>
          <Link className="btn" to="/app/complaints">
            All complaints
          </Link>
        </div>
      </>
    );

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <>
      <h1>Submit a complaint</h1>
      <Alert kind="info">
        <strong>Privacy.</strong> Your complaint is visible only to you, the handler assigned to it,
        and platform administrators. Avoid including sensitive personal details unless they are
        necessary.
      </Alert>
      {formError && <Alert>{formError}</Alert>}
      <form className="card" onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Category *" htmlFor="category" error={errors.categoryId}>
          <select
            id="category"
            value={f.categoryId}
            onChange={(e) => setF({ ...f, categoryId: e.target.value, subcategoryId: '' })}
          >
            <option value="">Choose a category</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issue type" htmlFor="sub">
          <select
            id="sub"
            value={f.subcategoryId}
            onChange={set('subcategoryId')}
            disabled={!subs.length}
          >
            <option value="">
              {subs.length ? 'Choose an issue type' : 'Choose a category first'}
            </option>
            {subs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Organization"
          htmlFor="org"
          error={errors.organizationName}
          hint="Pick a listed organization, or type the name below."
        >
          <select id="org" value={f.organizationId} onChange={set('organizationId')}>
            <option value="">Not listed — I will enter the name</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        {!f.organizationId && (
          <Field label="Organization or department name *" htmlFor="orgname">
            <input
              id="orgname"
              maxLength={LIMITS.organization.max}
              value={f.organizationName}
              onChange={set('organizationName')}
            />
          </Field>
        )}
        <Field label="Title *" htmlFor="title" error={errors.title}>
          <input id="title" maxLength={LIMITS.title.max} value={f.title} onChange={set('title')} />
        </Field>
        <Field
          label="Details *"
          htmlFor="desc"
          error={errors.description}
          hint={`What happened, where and when? (${f.description.trim().length}/${LIMITS.description.max})`}
        >
          <textarea
            id="desc"
            maxLength={LIMITS.description.max}
            value={f.description}
            onChange={set('description')}
          />
        </Field>
        <Field label="Location" htmlFor="loc" error={errors.location}>
          <input
            id="loc"
            maxLength={LIMITS.location.max}
            value={f.location}
            onChange={set('location')}
          />
        </Field>
        <p className="hint">
          Supporting evidence can be added from the complaint page once it is submitted (when
          enabled by the platform).
        </p>
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={f.acknowledgedPrivacy}
              onChange={(e) => setF({ ...f, acknowledgedPrivacy: e.target.checked })}
            />
            <span>
              I have read the{' '}
              <Link to="/privacy" target="_blank">
                privacy information
              </Link>{' '}
              and understand who can see this complaint.
            </span>
          </label>
          {errors.acknowledgedPrivacy && (
            <p className="field-error">{errors.acknowledgedPrivacy}</p>
          )}
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit complaint'}
        </button>
      </form>
    </>
  );
}

export function Settings() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string }>();

  async function save(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim().slice(0, 120), phone: phone.trim() || null })
      .eq('id', profile!.id);
    setMsg(
      error
        ? { kind: 'error', text: actionErrorMessage(error) }
        : { kind: 'success', text: 'Saved.' },
    );
    if (!error) await refreshProfile();
  }

  async function exportData() {
    const [p, c, ev, cm] = await Promise.all([
      supabase.from('profiles').select('id,email,full_name,phone,created_at').eq('id', profile!.id),
      supabase.from('complaints').select('*'),
      supabase.from('complaint_events').select('*'),
      supabase.from('complaint_comments').select('*'),
    ]);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            profile: p.data,
            complaints: c.data,
            events: ev.data,
            comments: cm.data,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-complaint-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <h1>Account</h1>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <form className="card" onSubmit={(e) => void save(e)}>
        <Field label="Email" htmlFor="e">
          <input id="e" value={profile?.email ?? ''} disabled />
        </Field>
        <Field label="Full name" htmlFor="n">
          <input id="n" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone (optional)" htmlFor="p">
          <input id="p" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <button className="btn btn-primary">Save changes</button>
      </form>
      <div className="card">
        <h2>Your data</h2>
        <p className="muted">Download a copy of your profile and the complaints you can see.</p>
        <button className="btn" onClick={() => void exportData()}>
          Download my data
        </button>
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '1.25rem 0' }} />
        <p className="muted" style={{ marginBottom: 0 }}>
          Account deletion requests are not available yet: they depend on a retention policy that
          has not been defined.
        </p>
      </div>
    </>
  );
}
