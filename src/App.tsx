import { Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/RequireRole.tsx';
import { PortalLayout, PublicLayout } from './components/Layout.tsx';
import { Categories, HowItWorks, Landing, Privacy, Terms } from './pages/Public.tsx';
import { Recover, Register, ResetPassword, SignIn } from './pages/AuthPages.tsx';
import { Dashboard, MyComplaints, Settings, SubmitComplaint } from './pages/complainant/Pages.tsx';
import { CaseView } from './pages/CaseView.tsx';
import { Queue } from './pages/handler/Pages.tsx';
import { Audit, Cases, Staff } from './pages/admin/Pages.tsx';

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="how-it-works" element={<HowItWorks />} />
        <Route path="categories" element={<Categories />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="terms" element={<Terms />} />
        <Route path="sign-in" element={<SignIn />} />
        <Route path="staff/sign-in" element={<SignIn staff />} />
        <Route path="register" element={<Register />} />
        <Route path="recover" element={<Recover />} />
        <Route path="reset-password" element={<ResetPassword />} />
      </Route>

      <Route path="app" element={<RequireRole role="complainant" />}>
        <Route element={<PortalLayout role="complainant" />}>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<SubmitComplaint />} />
          <Route path="complaints" element={<MyComplaints />} />
          <Route path="complaints/:id" element={<CaseView viewer="complainant" />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="handler" element={<RequireRole role="handler" />}>
        <Route element={<PortalLayout role="handler" />}>
          <Route index element={<Queue />} />
          <Route path="cases/:id" element={<CaseView viewer="handler" />} />
        </Route>
      </Route>

      <Route path="admin" element={<RequireRole role="admin" />}>
        <Route element={<PortalLayout role="admin" />}>
          <Route index element={<Cases />} />
          <Route path="cases/:id" element={<CaseView viewer="admin" />} />
          <Route path="staff" element={<Staff />} />
          <Route path="audit" element={<Audit />} />
        </Route>
      </Route>

      <Route path="*" element={<PublicLayout />}>
        <Route
          path="*"
          element={
            <>
              <h1>Page not found</h1>
              <p>That page does not exist.</p>
            </>
          }
        />
      </Route>
    </Routes>
  );
}
