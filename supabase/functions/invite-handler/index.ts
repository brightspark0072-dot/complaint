import { corsHeaders, isEmail, isUuid, json, requireAdmin } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405);

  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  let body: { email?: unknown; organizationId?: unknown; scope?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid request' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const scope = body.scope === 'organization' ? 'organization' : 'assigned_only';
  if (!isEmail(email) || !isUuid(body.organizationId))
    return json(req, { error: 'invalid request' }, 400);

  // Only brand-new accounts are invited: an existing public account is never silently converted to staff.
  const redirectTo = Deno.env.get('SITE_URL')
    ? `${Deno.env.get('SITE_URL')}/staff/sign-in`
    : undefined;
  const { data, error } = await ctx.admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error || !data.user) return json(req, { error: 'could not invite this address' }, 409);

  // The signup trigger created the profile as 'complainant'; this promotes it, verifying the actor again in SQL.
  const { error: rpcError } = await ctx.admin.rpc('provision_handler', {
    p_user: data.user.id,
    p_org: body.organizationId,
    p_scope: scope,
    p_actor: ctx.actor.id,
  });
  if (rpcError) {
    // Do not leave a half-provisioned account behind.
    await ctx.admin.auth.admin.deleteUser(data.user.id);
    return json(req, { error: 'could not provision handler' }, 400);
  }
  return json(req, { ok: true });
});
