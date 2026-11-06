# BSP module

The dashboard's BSP Registration module includes the existing BSP 1.1.6 workspace in a portal-owned window. Forms, online imports, camping, receipts, summaries, Excel exports, and backups are bundled; no standalone installation is needed. The portal's updater handles releases.

## Enable the website switch

1. Run `supabase-bsp-registration-control.sql` in the same Supabase project as the existing BSP tables. It requires `public.is_bsp_admin()` from the BSP schema. Registration stays open on first installation; rerunning the migration preserves its current status.
2. Sign in to the portal with a Supabase account listed in `public.bsp_admins`. Open **BSP Registration** and use the **Website registration** switch.
3. Deploy the accompanying changes in `D:\AProjects\Project_Rising` for the website's availability message and disabled registration form. The SQL migration blocks new public submissions even if a visitor has an older page open. Existing records and payment updates remain available.

The switch applies to BSP website registrations in this Supabase project. It does not close desktop registration or school enrollment. If status cannot be read, the website disables submission until the connection recovers; the database remains the final authority.

## Shared Supabase records

Run `supabase-bsp-workspace.sql` after the existing BSP registration, fee, receipt, and school-year migrations. The same migration is in `Project_Rising/supabase/bsp_workspace.sql` and the standalone app's `supabase` folder. Re-running it preserves the shared records.

Update and restart both apps. Sign in on the BSP Online tab as a BSP administrator. On the app with the complete paid records, choose **Upload existing BSP records** in the cloud banner once. Review its counts before confirming. This uploads units, scouts, adults, payments, receipts, camping, settings, counters, and archives. It does not invent payments or printing times. Other apps load the existing shared workspace automatically and preserve their previous local file as a recovery backup when it differs.

`bsp_workspace` is private to BSP administrators. The atomic `bsp_save_workspace` function checks the expected revision before accepting an edit, so a stale client cannot overwrite a newer receipt counter or payment. Linked website registrations are updated in the same transaction; removing a linked person rejects their website registration and clears its payment fields. School-year rollover keeps archived registrations. Local-only people are stored privately; the migration does not invent public website submissions or consent for them.

Both apps check for shared changes every five seconds. Changes load automatically when no form or print dialog is being edited. Otherwise, **Load latest from Supabase** lets the user discard the unsaved form explicitly. Keep both apps pointed at the same Supabase project. Edits and printer submissions require a confirmed connection; cached data remains available for reading and backup export. Stale or failed saves are rejected and the attempted snapshot is preserved in a uniquely named `bsp-recovery-*.json` file. Reconnect, review the shared records, and reapply the change. A lost response may mean the server committed the save: load the latest before retrying a payment.

The local `bsp-data.json` is a cache, not a second source of truth. Existing standalone data is copied only to seed a new portal cache and is uploaded only after explicit confirmation. Backup import replaces the shared workspace when its save succeeds; export a backup first. Erase/reset and delete actions affect all connected apps after synchronization. Old, unupdated app versions cannot participate safely and must be closed.

The snapshot limit is 5 MB. There is one school workspace per Supabase project. Use normalized per-record storage if the school outgrows this format.

## Checks

`npm run test:bsp` checks the reused registration, camping, school-year, receipt-sync, fee publication and backup logic, plus the original registration form and printer failure/retry tests, real portal IPC launch, menus, single-instance protection, minimized-window restore, isolated persistence, PDF preview and close. It uses temporary data and does not submit website registrations or print to hardware.

Apply the migration and verify the switch using an admin and a public visitor before release. The migration is supplied as source; build/test commands do not apply it to production.

The optional PostgreSQL migration test is `node scripts/bsp/test-workspace-sql.cjs` with `PGLITE_MODULE` pointing to an installed PGlite module. It checks authorization, privacy, revision conflicts, rollback, website projection, and archive retention without production access. PGlite is a test tool and is not bundled as an application dependency.

New registration now defaults to **No payment yet**. It creates a pending website registration without a payment or receipt number. Select **Payment received** only for money actually received. Disconnected forms accept drafts but block submission until shared records are loaded. Restart the full app after updating native services.

Re-run the updated registration-control migration when upgrading: BSP administrators are permitted to register people from desktop while public website registration is closed. Public visitors remain blocked.

Camp-only printing reserves its receipt number in Supabase before opening preview. Cancelling leaves the fee unpaid; the next attempt for that learner reuses the reservation. The number cannot be used by another payment.

Releases build in `buzzjay84/ieces-admin-portal` (v1.0.9 onward). Older installations configured for `jaybhee84/ieces-admin-portal` need the new BuzzJay installer once to move to that update channel.

Unpaid desktop submissions go directly to Pending payment and do not open a confirmation or receipt print dialog. Their submit button remains usable even while the private payment workspace is reconnecting. A BSP sign-in and successful server submission are still required.
