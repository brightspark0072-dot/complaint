/** Returns a reason string if the key must NOT be shipped to a browser, otherwise undefined. */
export function secretKeyProblem(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.startsWith('sb_secret_')) return 'a Supabase secret key';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as {
        role?: string;
      };
      if (payload.role === 'service_role') return 'a service_role key';
    } catch {
      /* not a decodable JWT: fine */
    }
  }
  return undefined;
}
