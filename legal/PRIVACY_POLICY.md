# VertexStealth Privacy Policy

**Effective date:** October 18, 2026
**Controller:** Vertex Tech Solutions ("Vertex", "we", "us")
**Privacy contact:** support@vertexstealth.top

This policy explains what personal data we collect when you use the VertexStealth desktop application and its account service, why we collect it, who we share it with, and the choices and rights you have.

## 1. Summary
- VertexStealth runs on your computer. **Your browser profiles, cookies, saved logins and proxy details stay on your device.** We do not receive them, and we do not see which websites you visit.
- On our servers we keep a small account record: your email address, your plan and trial dates, the onboarding answers you choose to give, your acceptance of our legal terms, and a hashed identifier of your device.
- The application contains **no advertising and no usage analytics**. It does send scrubbed crash reports (you can turn this off in Settings) and checks our server for updates, both described below. We do not sell your personal data.

## 2. Data we collect and why
| Data | When it is collected | Purpose | Legal basis (GDPR / UK GDPR) |
|---|---|---|---|
| Email address and password (the password is handled by our authentication provider and kept only as a salted hash) | When you sign up | Create and secure your account; send confirmation and password-reset emails | Performance of a contract |
| Plan, free-trial start and end dates, administrator and ban status | While your account exists | Apply plan limits, run the one-time trial, enforce suspensions and bans | Performance of a contract; legitimate interests (preventing abuse) |
| Profile registry: a random identifier for each browser profile you create (not its name, settings, proxy, cookies or any content) together with your device identifier | When you create, duplicate or delete a profile and when you sign in | Apply the profile limit of your plan on our server | Performance of a contract; legitimate interests (preventing abuse) |
| Acceptance record: the version of the legal terms you accepted and when | When you accept our terms | Show that you agreed to the Terms, EULA and this policy | Legal obligation; legitimate interests |
| Onboarding answers: use case, solo or team, number of accounts, familiarity with fingerprinting, how you heard about us | If you answer the onboarding questions | Understand our users and improve the product | Legitimate interests |
| Device identifier: a SHA-256 hash derived from your operating system's machine ID (it cannot be reversed into the raw hardware ID) | On sign-in and at launch | Bind a device to one account, enforce the one-time trial, block banned devices | Legitimate interests (fraud and abuse prevention) |
| Technical data logged by our hosting and authentication provider: IP address, timestamps and request metadata | When the app contacts the account service | Security, rate limiting, troubleshooting | Legitimate interests |
| Payment data: plan purchased, billing period, payment status, transaction reference and, from the payment provider, the payer's email and name. For cryptocurrency, the transaction ID and wallet address | When you pay | Take payment, issue refunds, keep tax and accounting records | Performance of a contract; legal obligation |
| Crash and error reports: report type, the error message and stack trace, app version, Electron version, operating-system name, version and architecture, and your account ID. Before sending, the app removes file paths, web addresses, IP addresses, e-mail addresses and long identifiers from the text. Reports never include your browser profiles, cookies, saved logins or proxy details | When the app or its interface crashes or hits an unexpected error, if crash reports are switched on (they are on by default and can be turned off at any time in Settings, Diagnostics) | Find and fix bugs and keep the app stable | Legitimate interests (software reliability and security) |
| Update checks: your IP address, the app version, your operating system and architecture, as part of an ordinary request to our update server | When the app checks for updates (shortly after start and every few hours) | Deliver new versions and security fixes | Legitimate interests (software security) |
| Messages you send us | If you contact us | Answer you and keep a support record | Legitimate interests |

We do **not** receive or store your full card number, card security code, PayPal password or crypto wallet keys; those are handled by the payment providers. Cryptocurrency transactions are recorded on public blockchains, which we cannot alter or erase.

We do not knowingly collect personal data from anyone under 18. If you believe a minor has given us data, contact us and we will delete it.

## 3. What stays on your device
Your browser profiles and their data (cookies, local storage, history, extensions), profile settings, proxy hostnames and any proxy credentials you enter, and application settings are stored in the application's data folder on your computer. Proxy credentials are used only to connect your browser profile to your proxy. Uninstalling the application does not automatically delete this folder; delete it yourself if you want it removed. When you browse, the websites you visit, your proxy provider and your network operator see your traffic as they normally would. We are not a party to it.

## 4. Who we share data with
- **Supabase**, our database and authentication provider, processes account data on our behalf as a processor.
- **Our update hosting provider** serves the update files and sees the IP address and version information of each update check. Crash reports are stored in our own Supabase project, the same processor that holds your account data.
- **Email delivery** for confirmation and password-reset messages is performed through our authentication provider.
- **Payment providers**: card payments are processed by a PCI-DSS-compliant card processor, PayPal handles PayPal payments, and Binance Pay handles cryptocurrency payments. Each acts under its own privacy policy for the data it processes.
- **Professional advisers, authorities and courts** where we are required by law, or need to protect rights, safety or the Service.
- **A successor** if we are involved in a merger, acquisition or sale of the business, with this policy continuing to apply to your data.

We do not sell personal data and do not share it for cross-context behavioural advertising.

## 5. International transfers
Our providers may process data in countries other than your own, including countries outside the European Economic Area and the United Kingdom. Where the law requires, we rely on safeguards such as the European Commission's standard contractual clauses or an adequacy decision.

## 6. How long we keep data
- **Account data**, including the profile registry, is kept while your account exists. When you delete your account from your account page (or ask us to), we remove or anonymise it straight away; copies in provider backups expire within 90 days. Partner-program and payment records we must keep for accounting are kept without your name and email. The identifier of a device that has used the Service is kept, no longer linked to you, so that a deleted account cannot restart a free trial on the same computer. Your email address may be kept on our do-not-email list if you opted out of messages.
- **Crash reports** are deleted automatically after 90 days. If you turn crash reports off, reports that were not yet sent are discarded on your device.
- **Ban records** (the hashed device identifier and the reason) are kept for up to 3 years after a ban so that a banned device cannot simply return, even if the account is deleted.
- **Payment and tax records** are kept for as long as the law requires, typically 6 to 7 years.
- **Acceptance records** are kept for the life of the account and for as long afterwards as needed to deal with claims.
- **Server logs** are kept by our providers for their standard retention periods.

## 7. Your rights
Depending on where you live, you may have the right to: access the data we hold about you; correct it; have it deleted; restrict or object to our processing; receive it in a portable format; withdraw consent where we rely on it; and complain to your data-protection authority. California residents may also request to know, delete and correct their data and to opt out of the sale or sharing of personal information; we do not sell or share it. You can switch off crash reports yourself at any time in Settings. On your account page you can download a copy of your data, delete your data while keeping your account, or delete your account. To exercise a right in another way, email support@vertexstealth.top. We may need to verify your identity, and we will respond within the time the law requires. A deletion request does not remove the ban record described in section 6 where we need it to prevent abuse.

## 8. Security
We use a managed authentication service, row-level security and restricted database functions, and encrypted connections between the application and our servers. No system is perfectly secure, so please protect your device and password. If you find a security problem, tell us at support@vertexstealth.top.

## 9. Cookies and websites
The desktop application does not set advertising or tracking cookies. If we operate a website, it will carry its own cookie notice. This policy covers the desktop application and the account service.

## 10. Changes to this policy
We may update this policy. For material changes we will notify you in the app or by email before they take effect, and the effective date above will change.

## 11. Contact
Vertex Tech Solutions, support@vertexstealth.top
