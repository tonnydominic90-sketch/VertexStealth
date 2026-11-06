# Partner program integration (website)

The website build now publishes these partner routes:

- `/partners-program` — public program page and application form
- `/r/:code` — referral tracking/redirect to `/download`
- `/partner` — partner magic-link login and partner dashboard
- `/partner-admin` — partner-program review and payout administration

The existing `/admin` remains the VertexStealth account/site admin. Its sidebar now links to **Partner program** (`/partner-admin`); partner-program administration is intentionally kept in its own protected screen and uses the partner Supabase RPCs/functions.

## Backend deployment required

The frontend integration does not itself apply a database migration or deploy Supabase Edge Functions. Before using applications/referrals/portal/admin in production:

1. Apply `partners-backend/supabase/partner-program.sql` to the project's Supabase database.
2. Deploy the `partner-apply`, `partner-click`, `partner-admin-review`, and `partner-portal` Edge Functions from `partners-backend/supabase/functions/`.
3. Confirm the partner settings in `site.config.json` (`partners.backendLive`, `functionsUrl`, `supabaseUrl`, `supabaseAnonKey`) match the same Supabase project. `supabaseAnonKey` is a public anon key; never put a service-role key in website config.
4. Configure the Edge Function email settings/secrets as documented in `partners-backend/docs/DEPLOY.md` and verify mail delivery.
5. Deploy the website with `npm run build` as the Vercel build command and `dist` as output.
6. Test an application, admin approval email, partner magic-link login, `/r/<partner-code>` tracking, and a test commission/payout workflow before announcing the program.

Partner admin requires a Supabase Auth administrator account with the partner-program admin permissions/RPC access established by the SQL migration. The normal website `/admin` role does not automatically grant partner-program admin rights.
