import { httpsCallable } from 'firebase/functions';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, functions } from '../firebase';

/** Callable function validates admin claims before querying the flight provider. */
export async function fetchLiveFlightPrices(params) {
  const call = httpsCallable(functions, 'searchFlights');
  const result = await call(params);
  return result.data;
}
export function subscribeToFlights(onData, onError) {
  const q = query(collection(db, 'flights'), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, snapshot => onData(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}
export function subscribeToHistory(flightId, onData, onError) {
  const q = query(collection(db, 'priceHistory'), orderBy('recordedAt', 'asc'));
  return onSnapshot(q, snapshot => onData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.flightId === flightId)), onError);
}