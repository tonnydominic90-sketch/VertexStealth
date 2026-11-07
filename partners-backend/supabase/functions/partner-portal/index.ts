// Partner portal API (public, no JWT; partners sign in with an emailed one-time link).
// POST { action: "request_login", email } | { action: "exchange", token } | { action: "account_login", access_token } | { action: "summary" }
//      | { action: "save_payout", method, details } | { action: "logout" }
import { originAllowed, randomToken, readJson, reply, serviceClient, sha256Hex, str } from "../_shared/util.ts";
import { loginEmail, portalUrl, sendEmail } from "../_shared/email.ts";

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return reply(req, 204, null);
  if (req.method !== "POST") return reply(req, 405, { error: "method_not_allowed" });
  if (!originAllowed(req)) return reply(req, 403, { error: "forbidden_origin" });
  const b = await readJson(req, 4000);
  if (!b) return reply(req, 400, { error: "bad_request" });
  const sb = serviceClient();
  const action = str(b.action, 20);

  if (action === "request_login") {
    const email = str(b.email, 160).toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      const token = randomToken();
      const { data } = await sb.rpc("partner_login_request", { p_email: email, p_token_hash: await sha256Hex(token) });
      if (data?.sent) await sendEmail({ ...loginEmail(data.name, `${portalUrl()}#token=${token}`), to: data.email });
    }
    return reply(req, 200, { ok: true }); // same answer whether or not the email belongs to a partner
  }

  if (action === "exchange") {
    const token = str(b.token, 100);
    if (token.length < 20) return reply(req, 401, { error: "invalid_link" });
    const session = randomToken();
    const { data } = await sb.rpc("partner_login_exchange", { p_token_hash: await sha256Hex(token), p_session_hash: await sha256Hex(session) });
    return data === true ? reply(req, 200, { ok: true, session }) : reply(req, 401, { error: "invalid_link" });
  }

  // An approved partner who is signed in to their normal VertexStealth account (password or Google) skips the emailed link:
  // we verify the account's login token with Supabase and require a CONFIRMED email that matches an active partner.
  if (action === "account_login") {
    const token = str(b.access_token, 4000);
    if (token.length < 20) return reply(req, 401, { error: "unauthorized" });
    const { data: u, error: uerr } = await sb.auth.getUser(token);
    const user = u?.user;
    if (uerr || !user?.email || !(user.email_confirmed_at || user.confirmed_at)) return reply(req, 401, { error: "unauthorized" });
    const session = randomToken();
    const { data } = await sb.rpc("partner_session_for_user", { p_email: user.email, p_session_hash: await sha256Hex(session) });
    return data === true ? reply(req, 200, { ok: true, session }) : reply(req, 403, { error: "not_a_partner" });
  }

  // everything below needs a valid session
  const m = /^Bearer\s+(\S{20,100})$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return reply(req, 401, { error: "unauthorized" });
  const sessionHash = await sha256Hex(m[1]);
  const { data: pid } = await sb.rpc("partner_session_partner", { p_session_hash: sessionHash });
  if (!pid) return reply(req, 401, { error: "unauthorized" });

  if (action === "summary") {
    const { data, error } = await sb.rpc("partner_portal_summary", { p_partner_id: pid });
    if (error || !data) return reply(req, 500, { error: "server" });
    return reply(req, 200, data);
  }
  if (action === "save_payout") {
    const { error } = await sb.rpc("partner_save_payout", { p_partner_id: pid, p_method: str(b.method, 10), p_details: str(b.details, 500) });
    return error ? reply(req, 422, { error: "invalid", message: "Please choose a payout method and enter valid details." }) : reply(req, 200, { ok: true });
  }
  if (action === "logout") { await sb.rpc("partner_logout", { p_session_hash: sessionHash }); return reply(req, 200, { ok: true }); }
  return reply(req, 400, { error: "bad_request" });
}
if (import.meta.main) Deno.serve(handle);
