VertexStealth auth email templates (link + 6-digit code)
=========================================================

Where to paste them: Supabase Dashboard > Authentication > Email Templates

1) "Confirm signup"
   Subject:  Your VertexStealth confirmation code: {{ .Token }}
   Body:     paste the whole of confirm-signup.html

2) "Reset password"
   Subject:  Your VertexStealth password reset code: {{ .Token }}
   Body:     paste the whole of reset-password.html

Settings to check (Authentication > Sign In / Providers > Email, or Auth settings):
- Email OTP length = 6
- Email OTP expiration = 3600 seconds (the emails say "1 hour"; change the wording if you change this)
- Confirm email = ON

Redirect URLs (Authentication > URL Configuration), add:
  https://www.vertexstealth.top/login
  https://www.vertexstealth.top/reset-password
  https://www.vertexstealth.top/account

Sending reliably: Supabase's built-in mail sender allows only a few emails per hour.
Use your Brevo account instead: Authentication > Emails > SMTP Settings
  Host smtp-relay.brevo.com, Port 587, username and SMTP key from Brevo > SMTP & API,
  sender email = a sender verified in Brevo (for example support@vertexstealth.top).

How the site uses the email:
- Link: opens the site and signs the person in (confirm) or opens /reset-password (reset).
- Code: typed on /signup (confirm) or /forgot (reset, together with the new password).
Either one works; using one uses up both.
