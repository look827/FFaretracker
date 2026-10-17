# Flight Price Intelligence Dashboard

React + Vite + Firebase Authentication + Cloud Firestore + Cloud Functions. Responsive UI, dark/light themes, historical charts, admin-only price edits, user watchlists, significant-movement email alert foundation, and unit tests.

## Important accuracy note
This scaffold does **not** claim that displayed sample fares are live. The initial dashboard contains explicitly labelled illustrative demo data. A real fare is only available after the backend is deployed, the RapidAPI key is rotated and configured as a secret, an admin account is provisioned, and the provider's response is reviewed/mapped. Flight fares are volatile and provider responses are not guaranteed to match the final checkout price.

## Prerequisites
- Node.js 20+
- Firebase project with Authentication (Email/Password), Firestore, Functions and Hosting enabled
- Firebase CLI (`npm i -g firebase-tools`)
- RapidAPI subscription for the `google-flights2` provider
- Resend account and verified sender domain for email alerts (optional)

## Local setup
```bash
npm install
cp .env.example .env.local
# Fill in Firebase web app configuration; do not put RAPIDAPI_KEY in VITE_* variables.
npm test
npm run dev
```

## Firebase setup and deploy
```bash
firebase login
firebase use --add
cd functions && npm install && cd ..
firebase functions:secrets:set RAPIDAPI_KEY
firebase functions:secrets:set RAPIDAPI_HOST
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set ALERT_FROM_EMAIL
firebase deploy --only firestore:rules,functions,hosting
```
Set the React `VITE_FIREBASE_*` variables in your deployment environment and rebuild before Hosting deploy (`npm run build`).

### Provision users and admin securely
1. Enable Email/Password in Firebase Authentication.
2. Create viewer accounts through the Firebase Console or a trusted invitation workflow.
3. Create one admin account, then use a trusted Firebase Admin SDK script / Cloud Shell session to set its custom claim to `{admin: true}`. Do not expose claim assignment in the browser.
4. Sign out and sign in again so the custom claim is refreshed.
5. Firestore Rules permit signed-in reads for shared fares and deny browser writes except each user's own watchlist/settings. Admin fare writes go through the callable function, which checks the custom claim.

Example trusted Node snippet (run only in a secure environment with Admin SDK credentials):
```js
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT });
const user = await getAuth().getUserByEmail('YOUR_ADMIN_EMAIL');
await getAuth().setCustomUserClaims(user.uid, { admin: true });
```

## Provider API
The backend calls the route shape provided in the request:
`/api/v1/searchFlights?departure_id=IXC&arrival_id=SHJ&outbound_date=2026-11-12&travel_class=ECONOMY&adults=1&show_hidden=1&currency=INR&language_code=en-US&country_code=IN&search_type=best`

The browser never calls RapidAPI directly. The current function returns raw provider payload for administrator review because upstream response schemas can change; it does not automatically treat unverified results as canonical fare history. Map actual response fields only after inspecting a real response and confirming that price, currency, dates, itineraries, stops, and airline values are correctly parsed.

## Email alerts
`notifyPriceMovement` checks 8% movements, then per-user watchlists and threshold settings. To enable alerts:
- Set `users/{uid}` fields `email` and `emailAlertsEnabled: true`.
- Add `users/{uid}/watchlist/{flightId}` for the tracked canonical flight.
- Optional threshold at `users/{uid}/alertSettings/{flightId}`: `{ "thresholdPct": 8 }`.
- Configure `RESEND_API_KEY` and `ALERT_FROM_EMAIL` secrets; verify sender domain.
- Consider scheduled digests, retries, idempotency keys, and email delivery logs before production.

## Tests
`npm test` tests fare formatting, percentage movement, threshold classification, and form validation. Extend with Firebase Emulator Suite integration tests for auth claims, rules, functions, and email behavior before production.

## Production hardening checklist
- Rotate the API key pasted into chat and use only Firebase Functions secrets.
- Restrict Firebase API keys by referrer where appropriate; Firebase web config is not a secret.
- Enable App Check, rate limiting, budget alerts, and monitoring.
- Add invitation-only account creation, password reset, audit log retention, and admin recovery.
- Add API schema validation and provider-response contract tests.
- Add scheduled refreshes only if permitted by provider plan and API terms.
- Ensure email alerts are idempotent and do not leak watchlist data between users.
- Avoid storing or displaying sample values as actual fares.
