'use strict';
// Email templates. category "service" = account/legal/operational messages (sent to everyone who qualifies).
// category "marketing" = optional news; respects unsubscribes and carries an unsubscribe link.
// Body syntax: blank line = new paragraph, "- " = bullet, **bold**, [text](https://link). Variables: {{name}} {{email}} {{plan}} {{download_url}} {{site_url}} {{support_email}}
const TEMPLATES = [
  { id: 'welcome', name: 'Welcome', topic: 'Onboarding', category: 'service', subject: 'Welcome to VertexStealth',
    body: 'Hi {{name}},\n\nWelcome to VertexStealth. Your account is ready and works on the website and in the desktop app.\n\n- Download the Windows app: [Download VertexStealth]({{download_url}})\n- Create a profile, set a proxy and launch it\n- Use the built-in Fingerprint Check to see what the browser reports\n\nYour free trial lasts 3 days. If you need help, just reply to this email.\n\nThe VertexStealth team' },
  { id: 'trial_ending', name: 'Trial ending soon', topic: 'Billing', category: 'service', subject: 'Your VertexStealth trial ends soon',
    body: 'Hi {{name}},\n\nYour VertexStealth free trial is about to end. After it ends your profiles are locked, not deleted, and they become usable again as soon as a paid plan is active.\n\nPlans: Monthly or Yearly. See [pricing]({{site_url}}/pricing).\n\nQuestions? Reply to this email or write to {{support_email}}.\n\nThe VertexStealth team' },
  { id: 'trial_ended', name: 'Trial ended - upgrade', topic: 'Billing', category: 'service', subject: 'Your VertexStealth trial has ended',
    body: 'Hi {{name}},\n\nYour free trial has ended. Your profiles are safe: they are locked and will unlock as soon as you pick a plan.\n\nChoose a plan on the [pricing page]({{site_url}}/pricing), or contact {{support_email}} if you need more time to evaluate.\n\nThe VertexStealth team' },
  { id: 'pricing_change', name: 'Pricing or plan change notice', topic: 'Billing', category: 'service', subject: 'Changes to VertexStealth plans and pricing',
    body: 'Hi {{name}},\n\nWe are changing our plans and pricing. In line with our Terms of Service, price changes apply from your next billing period and we give at least 30 days of notice.\n\n**What changes:** [describe the change]\n**When it starts:** [date]\n\nYou can cancel before the change takes effect. See [pricing]({{site_url}}/pricing) or write to {{support_email}}.\n\nThe VertexStealth team' },
  { id: 'maintenance', name: 'Maintenance / downtime', topic: 'Operations', category: 'service', subject: 'Planned maintenance for VertexStealth',
    body: 'Hi {{name}},\n\nWe will perform planned maintenance on [date and time, with timezone]. Sign-in and account features may be briefly unavailable. Profiles already stored on your computer are not affected.\n\nWe will keep the interruption as short as possible. Thank you for your patience.\n\nThe VertexStealth team' },
  { id: 'security_notice', name: 'Security notice', topic: 'Security', category: 'service', subject: 'Important security notice for your VertexStealth account',
    body: 'Hi {{name}},\n\nWe want to let you know about a security matter that may affect your account: [describe what happened and what is affected].\n\n**What you should do:**\n- Update to the latest version of VertexStealth\n- Change your password: [reset password]({{site_url}}/forgot)\n\nIf you have questions, contact {{support_email}}.\n\nThe VertexStealth team' },
  { id: 'policy_update', name: 'Terms / privacy update', topic: 'Legal', category: 'service', subject: 'We are updating our Terms and Privacy Policy',
    body: 'Hi {{name}},\n\nWe are updating our legal documents. The changes take effect on [date], at least 14 days from today.\n\n**Summary of changes:** [short summary]\n\nRead the full text: [Terms]({{site_url}}/terms) · [Privacy Policy]({{site_url}}/privacy) · [EULA]({{site_url}}/eula).\n\nIf you do not agree with the updated terms you may stop using the service and cancel before they take effect.\n\nThe VertexStealth team' },
  { id: 'support_followup', name: 'Support follow-up', topic: 'Support', category: 'service', subject: 'Following up on your VertexStealth support request',
    body: 'Hi {{name}},\n\nThanks for contacting us. [add details]\n\nIf this does not solve it, reply to this email and tell us your Windows version and the VertexStealth version.\n\nThe VertexStealth team' },
  { id: 'product_update', name: 'Product update', topic: 'News', category: 'marketing', subject: 'What is new in VertexStealth',
    body: 'Hi {{name}},\n\nHere is what changed in the latest VertexStealth release:\n\n- [improvement one]\n- [improvement two]\n- [fix or change]\n\nUpdate from inside the app, or [download the latest version]({{download_url}}).\n\nThe VertexStealth team' },
  { id: 'new_feature', name: 'New feature announcement', topic: 'News', category: 'marketing', subject: 'New in VertexStealth: [feature name]',
    body: 'Hi {{name}},\n\nWe just shipped **[feature name]**.\n\n[Two or three sentences about what it does and why it helps.]\n\nSee how it works on the [features page]({{site_url}}/features).\n\nThe VertexStealth team' },
  { id: 'reengagement', name: 'We miss you (re-engagement)', topic: 'News', category: 'marketing', subject: 'Your VertexStealth profiles are waiting',
    body: 'Hi {{name}},\n\nIt has been a while since you used VertexStealth. A lot has improved since then, including [highlights].\n\nPick up where you left off: [Download VertexStealth]({{download_url}}).\n\nThe VertexStealth team' },
  { id: 'blank', name: 'Blank message', topic: 'Custom', category: 'service', subject: '',
    body: 'Hi {{name}},\n\n\n\nThe VertexStealth team' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (u) => (/^(https?:\/\/|mailto:)/i.test(u) ? u : '#');

function fill(text, vars) { return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)); }

function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${esc(safeUrl(u.replace(/&amp;/g, '&')))}" style="color:#0875c9">${t}</a>`);
}

function renderBody(body, vars) {
  const text = fill(body, vars).replace(/\r/g, '');
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const html = blocks.map((b) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^- /.test(l))) return `<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li style="margin:0 0 6px">${inline(l.slice(2))}</li>`).join('')}</ul>`;
    if (lines.some((l) => /^- /.test(l))) {
      const intro = lines.filter((l) => !/^- /.test(l)).join('<br>');
      const lis = lines.filter((l) => /^- /.test(l));
      return `<p style="margin:0 0 10px">${inline(intro)}</p><ul style="margin:0 0 16px;padding-left:20px">${lis.map((l) => `<li style="margin:0 0 6px">${inline(l.slice(2))}</li>`).join('')}</ul>`;
    }
    return `<p style="margin:0 0 16px">${lines.map(inline).join('<br>')}</p>`;
  }).join('');
  const plain = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1: $2');
  return { html, plain };
}

function layout({ subject, bodyHtml, category, unsubscribeUrl, supportEmail, siteUrl }) {
  const foot = category === 'marketing'
    ? `You are receiving this because you have a VertexStealth account. <a href="${esc(unsubscribeUrl)}" style="color:#6b798b">Unsubscribe from product news</a>.`
    : 'You are receiving this service message because you have a VertexStealth account.';
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;color:#1b2a3a">
<div style="max-width:600px;margin:0 auto;padding:28px 16px">
<div style="font-size:20px;font-weight:800;letter-spacing:-.03em;margin:0 0 18px"><img src="${esc(siteUrl)}/icon-192.png" width="30" height="30" alt="" style="vertical-align:middle;border-radius:8px;margin-right:8px">Vertex<span style="color:#169ee8">Stealth</span></div>
<div style="background:#fff;border:1px solid #dfe8f0;border-radius:14px;padding:28px;font-size:15px;line-height:1.6">${bodyHtml}</div>
<p style="font-size:12px;color:#6b798b;margin:18px 4px 0;line-height:1.6">${foot}<br>Vertex Tech Solutions · <a href="mailto:${esc(supportEmail)}" style="color:#6b798b">${esc(supportEmail)}</a> · <a href="${esc(siteUrl)}" style="color:#6b798b">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a></p>
</div></body></html>`;
}

module.exports = { TEMPLATES, renderBody, layout, fill };
