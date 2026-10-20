import { corsHeaders, isUuid, json, requireAdmin } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405);

  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  let body: { userId?: unknown; suspended?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid request' }, 400);
  }
  if (!isUuid(body.userId) || typeof body.suspended !== 'boolean')
    return json(req, { error: 'invalid request' }, 400);

  const { error } = await ctx.admin.rpc('set_user_suspended', {
    p_user: body.userId,
    p_suspended: body.suspended,
    p_actor: ctx.actor.id,
  });
  if (error) return json(req, { error: 'could not update user' }, 400);

  // Also end any live sessions so a suspension takes effect immediately.
  if (body.suspended)
    await ctx.admin.auth.admin.signOut(body.userId, 'global').catch(() => undefined);
  return json(req, { ok: true });
});
