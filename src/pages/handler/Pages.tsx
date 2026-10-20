import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, Spinner, StatusBadge, fmtDate } from '../../components/ui.tsx';
import { supabase } from '../../lib/supabase.ts';
import { actionErrorMessage } from '../../lib/errors.ts';
import { STATUS_LABEL } from '../../lib/status.ts';
import type { Complaint } from '../../lib/types.ts';

/** Row-level security returns ONLY cases this handler is assigned to (or has organization scope for). */
export function Queue() {
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
          (!q ||
            `${r.title} ${r.case_ref} ${r.organization_name}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [rows, q, status],
  );
  if (error) return <Alert>{error}</Alert>;
  if (!rows) return <Spinner />;
  return (
    <>
      <h1>Assigned cases</h1>
      <p className="muted">You only see cases assigned to you or within your organization scope.</p>
      <div className="filters">
        <input
          aria-label="Search assigned cases"
          placeholder="Search by title, reference or organization"
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
          <Empty title="No cases">Nothing is assigned to you right now.</Empty>
        ) : (
          <ul className="list">
            {shown.map((r) => (
              <li className="list-item" key={r.id}>
                <div>
                  <Link to={`/handler/cases/${r.id}`}>{r.title}</Link>
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
