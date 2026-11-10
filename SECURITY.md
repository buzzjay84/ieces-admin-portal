# Security and rollout - 1.0.12

## Encryption and recovery

App-managed BSP cache, BSP session tokens, recovery snapshots, and the legacy local portal database use Electron safeStorage. On Windows this uses DPAPI under the current Windows account. Valid legacy JSON is encrypted atomically when the app starts; a failure leaves its previous file intact and stops startup. Corrupt or undecryptable data is never silently replaced. Legacy standalone BSP data is left untouched; the portal's inherited copy is encrypted.

Local encrypted files are tied to the OS account/key store. They are not portable backups. Use **Export encrypted backup** before moving computers, reinstalling Windows, or removing an account. Backups use AES-256-GCM, random salt/IV, and scrypt-derived keys. Passwords require at least 12 characters and confirmation. Keep the password separately: there is no recovery key. Legacy readable backups remain importable. Local recovery snapshots can be imported by the same OS account.

The portal's main Supabase login tokens remain in memory. Prior browser-storage token entries are removed at startup. BSP's separate saved session uses encrypted storage. Print previews stay in memory; old temporary preview files are cleaned at startup/exit. Operating-system paging, crash dumps, print spools, disk-sector remnants, and previously exported copies are outside this file-encryption guarantee. Use device encryption and protected backup locations as well.

CSV, Excel, and explicitly saved PDFs remain readable documents for their intended recipients. CSV/Excel exports warn before saving. These formats and printed paper are not encrypted by this release. Supabase provides infrastructure encryption at rest and HTTPS in transit; SQL fields remain readable to authorized database users. This is not end-to-end or column encryption. Supabase's documented protection: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq

## Server rollout required

The installer and GitHub release do not modify production Supabase policies or deploy Edge Functions.

1. Back up the database and review the report allowlist in Dashboard Manager. The shared project must already provide `public.is_app_email_allowed(text,text)` and the existing enrollment-dashboard, homepage-slide, and news-approval migrations. Apply the hardening migration last if older migrations are rerun.
2. Run `supabase-bsp-workspace.sql` to validate unit/archive shapes and sync adult email changes while preserving workspace revisions and payments.
3. Run `supabase-portal-access-hardening.sql`. Report-allowed staff can read dashboard data, manage homepage slides, and moderate news. Other accounts cannot use these formerly broad dashboard policies. News submissions cannot self-assign teacher/admin status to skip review. Existing policies used by other shared apps must be reviewed separately in the live project.
4. Run `supabase-private-mooe-receipts.sql`. It makes the MOOE bucket private and requires report-allowed accounts even if older permissive object policies remain. The app generates signed URLs valid for one hour; refresh the list when they expire. Existing public receipt links stop working. Public website photos remain public intentionally.
5. Deploy `supabase/functions/report-register/index.ts` with `supabase functions deploy report-register` using the shared project's credentials. Existing accounts must supply their current password to attach a portal profile. New accounts on the allowed-email list register immediately, without email confirmation, as requested. This deliberately trusts knowledge of a pre-approved email for first registration; use administrator provisioning if that becomes insufficient. The function requires the standard `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` environment values.
6. Verify with allowed staff, an authenticated outsider, and an anonymous browser. Check receipt viewing, news moderation, registration, and enrollment across the shared apps before declaring the server rollout complete.

The MIT license includes standard warranty and liability disclaimers. Their enforceability depends on applicable law; the license is not a promise of legal immunity. Source: https://opensource.org/license/mit

## Checks

`npm run build`, `npm run test:bsp`, `npm run test:ui`, and `npm run test:security` run locally and in the release workflow. SQL checks use an isolated PGlite database via `PGLITE_MODULE`; the workflow installs that tool outside application dependencies. They do not connect to production or send physical printer jobs.

Historical MOOE entries using the previous duplicated or misclassified object codes need accountant review. The release corrects future account choices and preserves stored values; it cannot infer which classification was intended.
