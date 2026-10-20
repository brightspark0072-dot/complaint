import { Link } from 'react-router-dom';

export function Landing() {
  return (
    <>
      <h1>Make your complaint heard.</h1>
      <p className="lead">
        Submit a complaint about an institution, service provider or public service, and follow it
        until it is resolved. Your complaint and evidence stay private by default.
      </p>
      <div className="btn-row" style={{ marginBottom: '2rem' }}>
        <Link className="btn btn-primary" to="/register">
          Create an account
        </Link>
        <Link className="btn" to="/sign-in">
          Sign in
        </Link>
      </div>
      <div className="grid grid-3">
        <div className="card">
          <h3>Private by default</h3>
          <p className="muted">Only you and the people assigned to your case can read it.</p>
        </div>
        <div className="card">
          <h3>Transparent progress</h3>
          <p className="muted">Every status change and update appears on your case timeline.</p>
        </div>
        <div className="card">
          <h3>Clear accountability</h3>
          <p className="muted">Each case has a reference number and an assigned handler.</p>
        </div>
      </div>
    </>
  );
}

export function HowItWorks() {
  const steps = [
    ['Create an account', 'Register with your email and confirm it.'],
    [
      'Submit your complaint',
      'Describe the issue, choose the organization, and optionally attach evidence.',
    ],
    ['It is reviewed and assigned', 'An administrator assigns your case to a handler.'],
    ['Track and respond', 'Follow updates, and answer any request for more information.'],
    [
      'Resolution',
      'The handler records the outcome and reasons. You can reopen a resolved case within 30 days.',
    ],
  ];
  return (
    <>
      <h1>How it works</h1>
      <ol className="list">
        {steps.map(([t, d], i) => (
          <li className="list-item" key={t}>
            <div>
              <strong>
                {i + 1}. {t}
              </strong>
              <p className="muted" style={{ margin: 0 }}>
                {d}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

export function Categories() {
  const cats = ['Public services', 'Consumer issues', 'Education', 'Workplace', 'Other'];
  return (
    <>
      <h1>Complaint categories</h1>
      <div className="grid grid-3">
        {cats.map((c) => (
          <div className="card" key={c}>
            <h3>{c}</h3>
          </div>
        ))}
      </div>
      <p className="muted">Categories are managed by administrators and may change.</p>
    </>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="alert alert-warn">
        <strong>Placeholder — requires legal review before launch.</strong> This text is not a legal
        document.
      </div>
      <p className="muted">
        The final {title.toLowerCase()} must be written and reviewed by qualified counsel for the
        jurisdictions you operate in (including data-protection, retention and disclosure rules)
        before real users are onboarded.
      </p>
    </>
  );
}
export const Privacy = () => <Placeholder title="Privacy policy" />;
export const Terms = () => <Placeholder title="Terms of service" />;
