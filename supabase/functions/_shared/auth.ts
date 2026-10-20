// Shared helpers for admin-only Edge Functions (Deno runtime).
// The service-role key lives ONLY here (injected by Supabase as a function secret) — never in the browser.
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = Deno.env.get('ALLOWED_ORIGIN') ?? '';
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed && origin === allowed ? origin : 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export interface AdminContext {
  admin: SupabaseClient; // service-role client
  actor: User; // the verified admin
}

/**
 * Verifies the bearer JWT with Supabase Auth (server-side), then confirms in the database that the caller is an
 * ACTIVE admin. Nothing the browser sends (body, headers, metadata) is trusted for authorization.
 * Returns a Response to send immediately when the caller is not allowed.
 */
export async function requireAdmin(req: Request): Promise<AdminContext | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(req, { error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return json(req, { error: 'unauthorized' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: profile } = await admin
    .from('profiles')
    .select('role,is_suspended')
    .eq('id', data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin' || profile.is_suspended)
    return json(req, { error: 'forbidden' }, 403);

  return { admin, actor: data.user };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export const isEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
