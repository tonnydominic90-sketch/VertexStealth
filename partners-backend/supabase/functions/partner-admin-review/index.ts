// POST { id, action: "approve" | "decline", reason? }  with the admin's own sign-in token (Authorization: Bearer ...)
// POST { id: <partner id>, action: "resend" }  sends the welcome email (link and code) again to an active partner
import { originAllowed, readJson, reply, str, userClient } from "../_shared/util.ts";
import { approvedEmail, declinedEmail, sendEmail } from "../_shared/email.ts";

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return reply(req, 204, null);
  if (req.method !== "POST") return reply(req, 405, { error: "method_not_allowed" });
  if (!originAllowed(req)) return reply(req, 403, { error: "forbidden_origin" });
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth)) return reply(req, 401, { error: "unauthorized" });

  const b = await readJson(req, 4000);
  const id = str(b?.id, 64), action = str(b?.action, 10), reason = str(b?.reason, 500);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approve", "decline", "resend"].includes(action)) return reply(req, 400, { error: "bad_request" });

  if (action === "resend") {
    // admin_list_partners re-checks is_admin() in Postgres, so a non-admin gets 'forbidden' here too.
    const { data: list, error: lerr } = await userClient(auth).rpc("admin_list_partners");
    if (lerr) {
      const m = lerr.message ?? "";
      if (m.includes("forbidden") || lerr.code === "42501") return reply(req, 403, { error: "forbidden" });
      console.error("resend lookup failed", m); return reply(req, 500, { error: "server" });
    }
    const p = (list as Array<{ id: string; name: string; email: string; code: string; status: string }> | null)?.find((x) => x.id === id);
    if (!p) return reply(req, 404, { error: "not_found" });
    if (p.status !== "active") return reply(req, 409, { error: "not_active" });
    const sent = await sendEmail({ ...approvedEmail(p.name, p.code), to: p.email });
    return reply(req, 200, { ok: true, action, emailed: sent });
  }

  // Runs as the caller: Postgres re-checks is_admin() and raises 'forbidden' for everyone else.
  const { data, error } = await userClient(auth).rpc("admin_review_partner_application", { p_id: id, p_action: action, p_reason: reason || null });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("forbidden") || error.code === "42501") return reply(req, 403, { error: "forbidden" });
    if (m.includes("already_reviewed")) return reply(req, 409, { error: "already_reviewed" });
    if (m.includes("not_found")) return reply(req, 404, { error: "not_found" });
    console.error("review failed", m); return reply(req, 500, { error: "server" });
  }
  const mail = action === "approve" ? approvedEmail(data.name, data.code) : declinedEmail(data.name, data.reason ?? null);
  const emailed = await sendEmail({ ...mail, to: data.email });
  return reply(req, 200, { ok: true, action, code: data.code ?? null, emailed });
}
if (import.meta.main) Deno.serve(handle);
