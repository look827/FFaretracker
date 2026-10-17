/**
 * Run from a trusted environment with Firebase Admin credentials.
 * Usage: GCLOUD_PROJECT=your-project node scripts/set-admin-claim.mjs user@example.com
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const email = process.argv[2];
if (!email) throw new Error('Pass the admin account email as the first argument.');
initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT });
const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { admin: true });
console.log(`Admin claim assigned to ${email}. Sign out and sign back in to refresh the token.`);
