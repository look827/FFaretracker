# Cloud Functions

Functions use Node 20 and Firebase Admin SDK. Secrets are never placed in the client bundle.

## Secrets
```bash
firebase functions:secrets:set RAPIDAPI_KEY
firebase functions:secrets:set RAPIDAPI_HOST
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set ALERT_FROM_EMAIL
firebase functions:secrets:set ADMIN_EMAILS
```
`ADMIN_EMAILS` is reserved for operator provisioning workflows. Admin status is enforced using Firebase Auth custom claims; configure claims through a trusted local/admin environment. Never create a public callable endpoint that lets users assign themselves the `admin` claim.

## Provision an administrator
1. Create the first account in Firebase Authentication.
2. From a trusted operator environment using Firebase Admin SDK, set `{ admin: true }` on that account's custom claims.
3. Sign out and sign in again (or force-refresh the ID token) so the claim is present.
4. For ongoing administration, use a protected CI job or secure local script. Do not ship a claim-setting utility to the browser.

`searchFlights` returns the provider payload to an authenticated admin for review. Provider response schemas may change. Inspect the returned payload before mapping it into canonical fares; no live provider call is made until deployed and secrets are configured.

Email notifications require user documents with `email` and `emailAlertsEnabled: true`, a matching watchlist document, alert settings, and a verified sender with your email provider.
