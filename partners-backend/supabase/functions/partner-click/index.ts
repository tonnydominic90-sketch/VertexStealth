// POST { code }  (public, no JWT) - counts a visit on a partner link and says whether the code exists
import { originAllowed, readJson, reply, serviceClient, str } from "../_shared/util.ts";

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return reply(req, 204, null);
  if (req.method !== "POST") return reply(req, 405, { error: "method_not_allowed" });
  if (!originAllowed(req)) return reply(req, 403, { error: "forbidden_origin" });
  const b = await readJson(req, 1000);
  const code = str(b?.code, 12).toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) return reply(req, 200, { valid: false });
  const { data, error } = await serviceClient().rpc("partner_record_click", { p_code: code });
  if (error) { console.error("click failed", error.message); return reply(req, 200, { valid: false }); }
  return reply(req, 200, { valid: data === true, code });
}
if (import.meta.main) Deno.serve(handle);
