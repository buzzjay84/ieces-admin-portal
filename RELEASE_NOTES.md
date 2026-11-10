IECES Admin Portal 1.0.12

- Encrypts app-managed local records, BSP sessions, and recovery snapshots using the OS key store.
- Adds password-protected portable BSP backups with tamper detection. Keep the password safe; it cannot be recovered.
- Keeps the allowed-email registration flow immediate, without confirmation emails. The updated server function verifies the existing password when linking an existing account.
- Fixes incomplete MOOE saves after failed receipt uploads, removes unused hard-coded local login code, and stops writing temporary print-preview PDFs.
- Adds private receipt links, database access hardening, workspace validation, and regression checks.
- Updates Electron and Vite to address high/critical dependency findings. Six moderate findings remain in electron-builder's build-only dependency tree.
- Adds the MIT license with warranty/liability disclaimers. Third-party assets retain their own terms.

Required server rollout: apply the supplied workspace, portal-access, and private-receipt migrations, then deploy the report-register Edge Function. The installer does not change Supabase configuration. See the attached SECURITY.md for order and shared-app checks.

Local files are bound to the OS account. Export an encrypted backup before moving machines or reinstalling Windows. CSV, Excel, saved PDFs, and printed documents remain readable; this release does not add end-to-end database encryption.
