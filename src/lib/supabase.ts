import { createClient } from '@supabase/supabase-js';
import { secretKeyProblem } from './env.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const problem = secretKeyProblem(key);
if (problem) {
  // Fail closed: never run the app with a privileged key in the browser bundle.
  throw new Error(
    `VITE_SUPABASE_ANON_KEY contains ${problem}. Remove it and rotate that key immediately.`,
  );
}

export const isSupabaseConfigured = Boolean(url && key);
export const evidenceUploadsEnabled = import.meta.env.VITE_EVIDENCE_UPLOADS_ENABLED === 'true';

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
