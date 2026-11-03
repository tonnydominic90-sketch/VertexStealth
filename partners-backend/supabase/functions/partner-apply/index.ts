// POST { name, email, country, channel_url?, promotion_plan }  (public, no JWT)
import { clientIp, env, originAllowed, readJson, reply, serviceClient, sha256Hex, str } from "../_shared/util.ts";
import { adminNewApplication, applicantReceived, sendEmail } from "../_shared/email.ts";

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return reply(req, 204, null);
  if (req.method !== "POST") return reply(req, 405, { error: "method_not_allowed" });
  if (!originAllowed(req)) return reply(req, 403, { error: "forbidden_origin" });

  const b = await readJson(req);
  if (!b) return reply(req, 400, { error: "bad_request", message: "Invalid request." });
  if (b.company_website) return reply(req, 200, { ok: true }); // honeypot: pretend success

  const name = str(b.name, 120), email = str(b.email, 160).toLowerCase(), country = str(b.country, 80);
  const channel = str(b.channel_url, 300), plan = str(b.promotion_plan, 1500);
  if (name.length < 2 || country.length < 2 || plan.length < 30 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      (channel && !/^https?:\/\//i.test(channel))) {
    return reply(req, 422, { error: "invalid", message: "Please check your details. Your plan should be at least a couple of sentences." });
  }

  const ipHash = await sha256Hex(`${env("PARTNER_IP_SALT", "change-me")}|${clientIp(req)}`);
  const sb = serviceClient();
  const { data, error } = await sb.rpc("submit_partner_application", {
    p_name: name, p_email: email, p_country: country, p_channel: channel, p_plan: plan, p_ip_hash: ipHash,
  });
  if (error) { console.error("submit failed", error.message); return reply(req, 500, { error: "server", message: "Something went wrong. Please try again." }); }

  switch (data?.status) {
    case "created": {
      const to = env("ADMIN_NOTIFY_EMAIL");
      const jobs: Promise<boolean>[] = [sendEmail({ ...applicantReceived(name), to: email })];
      if (to) jobs.push(sendEmail({ ...adminNewApplication({ name, email, country, channel, plan }), to }));
      await Promise.allSettled(jobs);
      return reply(req, 200, { ok: true });
    }
    case "duplicate": return reply(req, 409, { error: "duplicate", message: "We already have an application from this email address. We will be in touch." });
    case "rate_limited": return reply(req, 429, { error: "rate_limited", message: "Too many applications from your network today. Please try again tomorrow." });
    default: return reply(req, 422, { error: "invalid", message: "Please check your details and try again." });
  }
}
if (import.meta.main) Deno.serve(handle);
