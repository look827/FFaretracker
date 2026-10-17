import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();
const RAPIDAPI_KEY = defineSecret('RAPIDAPI_KEY');
const RAPIDAPI_HOST = defineSecret('RAPIDAPI_HOST');
const ADMIN_EMAILS = defineSecret('ADMIN_EMAILS');
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const ALERT_FROM_EMAIL = defineSecret('ALERT_FROM_EMAIL');

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
}
function requireAdmin(request) {
  requireAuth(request);
  if (request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'Administrator access is required.');
}
function validIata(value) { return typeof value === 'string' && /^[A-Z]{3}$/.test(value); }
function validateRoute(data) {
  if (!validIata(data.departure) || !validIata(data.arrival) || data.departure === data.arrival) {
    throw new HttpsError('invalid-argument', 'Origin and destination must be different 3-letter IATA codes.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || data.outboundDate || '')) throw new HttpsError('invalid-argument', 'Departure date must be YYYY-MM-DD.');
}
function safeFlightId(departure, arrival, date) { return `${departure}_${arrival}_${date}`; }

/** Run once as a privileged operator to assign/remove the custom admin claim.
 * Do not expose this function to normal users; run via a trusted shell/admin environment. */
export async function setAdminClaim(uid, enabled = true) {
  await getAuth().setCustomUserClaims(uid, { admin: Boolean(enabled) });
}

/** Only admins can query provider API; key is stored in Firebase Functions secrets. */
export const searchFlights = onCall({ secrets: [RAPIDAPI_KEY, RAPIDAPI_HOST] }, async request => {
  requireAdmin(request);
  const data = request.data || {};
  validateRoute({ ...data, date: data.outboundDate || data.date });
  const params = new URLSearchParams({
    departure_id: data.departure, arrival_id: data.arrival,
    outbound_date: data.outboundDate || data.date,
    travel_class: data.travelClass || 'ECONOMY', adults: String(data.adults || 1),
    show_hidden: '1', currency: data.currency || 'INR', language_code: 'en-US',
    country_code: 'IN', search_type: 'best'
  });
  const host = RAPIDAPI_HOST.value() || 'google-flights2.p.rapidapi.com';
  const response = await fetch(`https://${host}/api/v1/searchFlights?${params}`, {
    headers: { 'x-rapidapi-host': host, 'x-rapidapi-key': RAPIDAPI_KEY.value() },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new HttpsError('unavailable', `Flight provider returned HTTP ${response.status}.`);
  const payload = await response.json();
  // Return provider data for admin review. Do not label this as guaranteed/official Google data.
  return { fetchedAt: new Date().toISOString(), source: 'RapidAPI Google Flights provider', count: Array.isArray(payload?.data) ? payload.data.length : undefined, payload };
});

/** Admin-only canonical price update + append-only history point. */
export const adminUpdateFlightPrice = onCall(async request => {
  requireAdmin(request);
  const d = request.data || {};
  validateRoute({ ...d, date: d.date });
  const price = Number(d.price);
  if (!Number.isFinite(price) || price <= 0 || price > 100000000) throw new HttpsError('invalid-argument', 'Price must be a positive, plausible numeric value.');
  const id = safeFlightId(d.departure, d.arrival, d.date);
  const ref = db.collection('flights').doc(id);
  const old = await ref.get();
  const previousPrice = old.exists ? Number(old.data().price) : null;
  const update = {
    departure: d.departure, arrival: d.arrival, date: d.date, price,
    previousPrice, airline: String(d.airline || 'Unspecified').slice(0,100),
    stops: Math.max(0, Math.min(10, Number(d.stops || 0))),
    duration: String(d.duration || '—').slice(0,30), currency: 'INR',
    source: String(d.source || 'admin-entered').slice(0,100),
    updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid
  };
  await ref.set(update, { merge: true });
  await db.collection('priceHistory').add({ flightId: id, departure: d.departure, arrival: d.arrival, date: d.date, price, previousPrice, currency: 'INR', recordedAt: FieldValue.serverTimestamp(), recordedBy: request.auth.uid });
  return { id, previousPrice, price, updated: true };
});

/** Provision admin claim through a trusted local script; not an HTTP endpoint. */
export async function applyAdminClaimForEmail(email, enabled = true) {
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, { admin: Boolean(enabled) });
}

/** Significant movements trigger per-user watchlist threshold emails via Resend.
 * Configure secrets and verify sender domain before deploying. */
export const notifyPriceMovement = onDocumentWritten({
  document: 'flights/{flightId}',
  secrets: [RESEND_API_KEY, ALERT_FROM_EMAIL]
}, async event => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!after || !before || !Number(before.price) || !Number(after.price)) return;
  const pct = ((Number(after.price) - Number(before.price)) / Number(before.price)) * 100;
  if (Math.abs(pct) < 8) return;
  const users = await db.collection('users').get();
  const subject = `Flight fare ${pct < 0 ? 'dropped' : 'increased'} ${Math.abs(pct).toFixed(1)}%: ${after.departure} → ${after.arrival}`;
  for (const userDoc of users.docs) {
    const userData = userDoc.data();
    if (userData.emailAlertsEnabled !== true || !userData.email) continue;
    const watch = await userDoc.ref.collection('watchlist').doc(event.params.flightId).get();
    if (!watch.exists) continue;
    const settingsSnap = await userDoc.ref.collection('alertSettings').doc(event.params.flightId).get();
    const threshold = Number(settingsSnap.data()?.thresholdPct ?? 8);
    if (Math.abs(pct) < threshold) continue;
    const apiKey = RESEND_API_KEY.value();
    const from = ALERT_FROM_EMAIL.value();
    if (!apiKey || !from) continue;
    await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [userData.email], subject, html: `<p>${after.departure} → ${after.arrival} (${after.date}) changed from ₹${before.price} to ₹${after.price} (${pct.toFixed(1)}%).</p><p>Review before booking; prices can change at any time.</p>` })
    });
  }
});