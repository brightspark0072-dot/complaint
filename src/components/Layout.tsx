import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { homeFor } from '../auth/RequireRole.tsx';
import type { AppRole } from '../lib/types.ts';

function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="Complaint.com home">
      <span className="brand-mark" aria-hidden="true">
        C
      </span>
      Complaint.com
    </Link>
  );
}

export function PublicLayout() {
  const { profile } = useAuth();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Primary" className="site-nav">
          <Link to="/how-it-works">How it works</Link>
          <Link to="/categories">Categories</Link>
          {profile ? (
            <Link className="btn btn-primary" to={homeFor(profile.role)}>
              Open workspace
            </Link>
          ) : (
            <>
              <Link to="/sign-in">Sign in</Link>
              <Link className="btn btn-primary" to="/register">
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>
      <main id="main" className="container">
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>© Complaint.com</span>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/staff/sign-in">Staff sign in</Link>
      </footer>
    </>
  );
}

const NAV: Record<AppRole, { to: string; label: string; end?: boolean }[]> = {
  complainant: [
    { to: '/app', label: 'Overview', end: true },
    { to: '/app/new', label: 'Submit a complaint' },
    { to: '/app/complaints', label: 'My complaints' },
    { to: '/app/settings', label: 'Account' },
  ],
  handler: [{ to: '/handler', label: 'Assigned cases', end: true }],
  admin: [
    { to: '/admin', label: 'Cases & assignment', end: true },
    { to: '/admin/staff', label: 'Staff' },
    { to: '/admin/audit', label: 'Audit log' },
  ],
};

const TITLE: Record<AppRole, string> = {
  complainant: 'My workspace',
  handler: 'Handler workspace',
  admin: 'Administration',
};

export function PortalLayout({ role }: { role: AppRole }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="portal">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand to={homeFor(role)} />
        <p className="sidebar-title">{TITLE[role]}</p>
        <nav aria-label={TITLE[role]}>
          {NAV[role].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="who">{profile?.full_name || profile?.email}</span>
          <button
            className="btn btn-quiet"
            onClick={() =>
              void signOut().then(() => navigate(role === 'complainant' ? '/' : '/staff/sign-in'))
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <main id="main" className="portal-main">
        <Outlet />
      </main>
    </div>
  );
}
