# VertexStealth partner program: backend

```
supabase/partner-program.sql          database migration (tables, RLS lock-down, all functions)
supabase/functions/_shared/           CORS, input checks, e-mail (Resend)
supabase/functions/partner-apply/     public application form endpoint
supabase/functions/partner-click/     counts visits on a partner link
supabase/functions/partner-admin-review/  approve / decline (admin only) + e-mails the applicant
supabase/functions/partner-portal/    partner sign-in link, dashboard data, payout details
supabase/config.toml.snippet          which functions are public
app-integration/referral.js           desktop app: remember + claim a referral code
docs/DEPLOY.md  docs/PAYMENT-HOOKS.md  docs/APP-INTEGRATION.md
test/                                 the test suites used to verify all of the above (need Postgres, PostgREST, Deno)
```
How money flows: referral claimed -> first paid order -> commission **pending** -> after `hold_days` **approved** -> admin records a payout -> **paid**.
A refund cancels a pending/approved commission; a refund of an already-paid one is deducted from the partner's next payout.
Start with `docs/DEPLOY.md`.
