# Marketing Tracker

## Setup

1. Create a Firebase project and enable Email/Password Authentication and Realtime Database.
2. Create a Google Cloud service account, enable Google Sheets API, and share the target spreadsheet with the service account email.
3. Copy `.env.example` to `.env.local` and fill in values.
4. Create a `Leads` sheet with columns: Lead ID, Team ID, Member ID, QR Code ID, Name, Phone, Email, Created At, Sync Status.
5. Install and run:

```bash
npm install
npm run dev
```

## QR URLs

Use `/scan?qr=QR_CODE_ID`. Store QR records under `qrCodes/{id}`:

```json
{"type":"member","teamId":"team1","memberId":"uid1","active":true}
```

For a shared team QR omit `memberId` and use `type":"team"`.

## Roles

Set `users/{uid}/role` to `admin` or `member`; members should also have `teamId`. Admin creation and QR management endpoints should be added behind `requireAdmin` before production use.

## Sync

Leads are written to Firebase and placed in `syncQueue`. Vercel Cron calls `/api/cron/sync` every minute with `Authorization: Bearer $CRON_SECRET`. The worker retries with exponential backoff and removes queue entries only after a successful Sheets append.

## Production hardening

- Add idempotency keys or a dedicated sync ledger before handling high-volume traffic.
- Add rate limiting and CAPTCHA to `/api/leads`.
- Use Firebase custom claims or verified profile lookups for every admin/member API.
- Add indexes and team-scoped queries for large datasets.
- Never expose service-account credentials to the browser.
