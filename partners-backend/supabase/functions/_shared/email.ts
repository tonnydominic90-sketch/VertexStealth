import { env, esc, siteUrl } from "./util.ts";

export interface Mail { to: string; subject: string; html: string; text: string }

/** "Name <a@b.c>" or "a@b.c" -> { name?, email } */
function parseAddress(v: string): { name?: string; email: string } {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: v.trim() };
}

/** Sends through Brevo (transactional API). BREVO_API_KEY = v3 API key; EMAIL_FROM must be a verified Brevo sender.
 *  Returns false (and logs) instead of throwing, so a mail problem never breaks a request. */
export async function sendEmail(m: Mail): Promise<boolean> {
  const key = env("BREVO_API_KEY");
  if (!key) { console.warn("BREVO_API_KEY not set - email not sent:", m.subject); return false; }
  try {
    const body: Record<string, unknown> = {
      sender: parseAddress(env("EMAIL_FROM", "VertexStealth <support@vertexstealth.top>")),
      to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text,
    };
    const rt = env("EMAIL_REPLY_TO"); if (rt) body.replyTo = parseAddress(rt);
    const r = await fetch(env("BREVO_API_URL", "https://api.brevo.com/v3/smtp/email"), {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error("email failed", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) { console.error("email error", String(e)); return false; }
}

const shell = (title: string, body: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2433;line-height:1.6">
<p style="margin:0 0 16px"><img src="${siteUrl()}/icon-192.png" width="34" height="34" alt="VertexStealth" style="vertical-align:middle;border-radius:9px"> <b style="font-size:17px;vertical-align:middle">VertexStealth</b></p>
<h2 style="margin:0 0 14px">${esc(title)}</h2>${body}
<p style="color:#7a8898;font-size:12px;margin-top:28px">VertexStealth Partner Program</p></div>`;

const btn = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;background:#0e8fd9;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-weight:bold">${esc(label)}</a></p>`;

export const portalUrl = () => env("PORTAL_URL", `${siteUrl()}/partner`);
export const referralLink = (code: string) => `${siteUrl()}/r/${code}`;

export function applicantReceived(name: string): Mail & { to?: string } {
  return {
    to: "", subject: "We received your partner application",
    html: shell("Thanks for applying", `<p>Hi ${esc(name)},</p><p>We received your VertexStealth Partner Program application. A person on our team reviews every application, and we usually reply within ${esc(env("REVIEW_TIME", "3 business days"))}.</p><p>You will get an email either way.</p>`),
    text: `Hi ${name},\n\nWe received your VertexStealth Partner Program application. We usually reply within ${env("REVIEW_TIME", "3 business days")}. You will get an email either way.\n`,
  };
}

export function adminNewApplication(a: { name: string; email: string; country: string; channel: string; plan: string }): Mail & { to?: string } {
  const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#667588;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v) || "-"}</td></tr>`;
  return {
    to: "", subject: `New partner application: ${a.name.slice(0, 60)}`,
    html: shell("New partner application", `<table>${row("Name", a.name)}${row("Email", a.email)}${row("Country", a.country)}${row("Channel", a.channel)}${row("Plan", a.plan)}</table><p>Review it in the admin page.</p>`),
    text: `New partner application\nName: ${a.name}\nEmail: ${a.email}\nCountry: ${a.country}\nChannel: ${a.channel}\nPlan: ${a.plan}\n`,
  };
}

export function approvedEmail(name: string, code: string): Mail & { to?: string } {
  const link = referralLink(code);
  return {
    to: "", subject: "You are in: your VertexStealth partner link",
    html: shell("Welcome to the Partner Program", `<p>Hi ${esc(name)}, your application was approved.</p><p><b>Your referral link</b><br><a href="${esc(link)}">${esc(link)}</a></p><p><b>Your referral code</b><br><span style="font-size:20px;letter-spacing:2px">${esc(code)}</span></p><p>People who follow your link are told to enter your code when they create their VertexStealth account.</p>${btn(portalUrl(), "Open your partner portal")}<p>If you have a VertexStealth account with this email address (including Google sign-in), simply sign in on the website and open <b>Partner dashboard</b> from your account page. Otherwise the portal can email you a one-time sign-in link. Please read the Partner Program Terms and always disclose that you earn commission.</p>`),
    text: `Hi ${name}, your application was approved.\n\nReferral link: ${link}\nReferral code: ${code}\n\nPartner portal: ${portalUrl()}\nSign in to your VertexStealth account with this email address and open Partner dashboard, or request a one-time sign-in link on that page.\n`,
  };
}

export function declinedEmail(name: string, reason: string | null): Mail & { to?: string } {
  const why = reason ? `<p>Note from our team: ${esc(reason)}</p>` : "";
  return {
    to: "", subject: "Your VertexStealth partner application",
    html: shell("About your application", `<p>Hi ${esc(name)},</p><p>Thank you for applying. We are not able to approve your application right now.</p>${why}<p>You are welcome to apply again later with a clearer plan for how you will share VertexStealth.</p>`),
    text: `Hi ${name},\n\nThank you for applying. We are not able to approve your application right now.${reason ? `\nNote from our team: ${reason}` : ""}\n\nYou are welcome to apply again later.\n`,
  };
}

export function loginEmail(name: string, link: string): Mail & { to?: string } {
  return {
    to: "", subject: "Your partner portal sign-in link",
    html: shell("Sign in to your partner portal", `<p>Hi ${esc(name)},</p>${btn(link, "Sign in")}<p>This link works once and expires in 20 minutes. If you did not ask for it, you can ignore this email.</p>`),
    text: `Hi ${name},\n\nSign in: ${link}\n\nThis link works once and expires in 20 minutes. If you did not ask for it, ignore this email.\n`,
  };
}
