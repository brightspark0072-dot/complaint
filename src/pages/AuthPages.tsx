import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { homeFor } from '../auth/RequireRole.tsx';
import { Alert, Field } from '../components/ui.tsx';
import { isSupabaseConfigured } from '../lib/supabase.ts';
import { validateEmail, validateNewPassword } from '../lib/validation.ts';

function ConfigWarning() {
  return isSupabaseConfigured ? null : (
    <Alert kind="warn">
      Supabase is not configured. Copy .env.example to .env.local and set the project URL and
      publishable key.
    </Alert>
  );
}

export function SignIn({ staff = false }: { staff?: boolean }) {
  const { signIn, profile } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) navigate(homeFor(profile.role), { replace: true });
  }, [profile, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const bad = validateEmail(email) ?? (password ? undefined : 'Enter your password.');
    if (bad) return setError(bad);
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  }

  return (
    <div className="card auth-card">
      <h1>{staff ? 'Staff sign in' : 'Sign in'}</h1>
      {staff && (
        <p className="muted">
          For complaint handlers and administrators. Staff accounts are created by invitation only.
        </p>
      )}
      <ConfigWarning />
      {error && <Alert>{error}</Alert>}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        <Link to="/recover">Forgot your password?</Link>
        {!staff && (
          <>
            {' '}
            · <Link to="/register">Create an account</Link>
          </>
        )}
      </p>
    </div>
  );
}

export function Register() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Enter your name.';
    const em = validateEmail(form.email);
    if (em) errs.email = em;
    const pw = validateNewPassword(form.password);
    if (pw) errs.password = pw;
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await signUp(form.email, form.password, form.name);
    setBusy(false);
    setFormError(r.error);
    setMessage(r.message);
  }

  if (message)
    return (
      <div className="card auth-card">
        <h1>Check your email</h1>
        <Alert kind="success">{message}</Alert>
        <Link to="/sign-in">Back to sign in</Link>
      </div>
    );
  return (
    <div className="card auth-card">
      <h1>Create your account</h1>
      <ConfigWarning />
      {formError && <Alert>{formError}</Alert>}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Full name" htmlFor="name" error={errors.name}>
          <input id="name" autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={set('email')}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          error={errors.password}
          hint="At least 10 characters, with letters and numbers."
        >
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm}>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set('confirm')}
          />
        </Field>
        <p className="hint" style={{ marginBottom: '1rem' }}>
          By creating an account you agree to the <Link to="/terms">Terms</Link> and{' '}
          <Link to="/privacy">Privacy policy</Link>.
        </p>
        <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        Already registered? <Link to="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}

export function Recover() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string>();
  const [msg, setMsg] = useState<string>();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const bad = validateEmail(email);
    if (bad) return setErr(bad);
    const r = await requestPasswordReset(email);
    setErr(r.error);
    setMsg(r.message);
  }
  return (
    <div className="card auth-card">
      <h1>Reset your password</h1>
      {msg && <Alert kind="success">{msg}</Alert>}
      {err && <Alert>{err}</Alert>}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary" style={{ width: '100%' }}>
          Send reset link
        </button>
      </form>
      <p style={{ marginTop: '1rem' }}>
        <Link to="/sign-in">Back to sign in</Link>
      </p>
    </div>
  );
}

export function ResetPassword() {
  const { updatePassword, session, loading } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string>();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const bad = validateNewPassword(pw);
    if (bad) return setErr(bad);
    const r = await updatePassword(pw);
    if (r) return setErr(r);
    navigate('/sign-in');
  }
  if (!loading && !session)
    return (
      <div className="card auth-card">
        <Alert kind="warn">This reset link is invalid or has expired.</Alert>
        <Link to="/recover">Request a new link</Link>
      </div>
    );
  return (
    <div className="card auth-card">
      <h1>Choose a new password</h1>
      {err && <Alert>{err}</Alert>}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <Field
          label="New password"
          htmlFor="pw"
          hint="At least 10 characters, with letters and numbers."
        >
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary" style={{ width: '100%' }}>
          Update password
        </button>
      </form>
    </div>
  );
}
