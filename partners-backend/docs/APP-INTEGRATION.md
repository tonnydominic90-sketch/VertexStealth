# Desktop app: referral code at sign-up

Goal: a person who arrives through a partner link sees the partner's code on the website's Download page, installs the
app, types the code into an optional **Referral code** box when creating their account, and the server credits the partner.

1. Copy `app-integration/referral.js` to `src/referral.js` (tested, 13 checks).
2. **Sign-up form** (renderer): add an optional text input "Referral code (optional)", 8 letters/numbers, no validation needed beyond
   `maxlength=12` (the module normalises it). Send it to the main process with the existing sign-up IPC call.
3. **Main process, sign-up handler**: after `supabase.auth.signUp(...)` succeeds,
   ```js
   const { savePendingReferral } = require('./referral');
   if (referralCode) savePendingReferral(referralCode);   // remembered on disk until the user has a session
   ```
4. **After every successful sign-in** (and after the e-mail confirmation deep link has created the session):
   ```js
   const { claimPendingReferral } = require('./referral');
   claimPendingReferral(supabase).catch(() => {});        // no-op when nothing is pending; never blocks login
   ```
   Do this fire-and-forget so a network problem can never break sign-in. The server answers `ok`, `invalid_code`,
   `already_referred`, `self_referral` or `too_late` (the account must be at most 72 hours old; change `claim_window_hours`
   in `partner_settings`). Only definitive answers clear the saved code; a network error keeps it for the next sign-in.
5. Optional, later: show a small "Referral applied" notice when the answer is `ok`.

Nothing else in the app changes. The partner never needs the app: their portal is on the website.
