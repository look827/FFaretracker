/** Pure helpers shared by UI and unit tests. */
export function formatINR(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0
  }).format(Number(value));
}
export function percentChange(previous, current) {
  const p = Number(previous), c = Number(current);
  if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0) return null;
  return ((c - p) / p) * 100;
}
export function classifyMovement(previous, current, thresholdPct = 8) {
  const change = percentChange(previous, current);
  if (change === null) return 'unknown';
  if (change >= thresholdPct) return 'surge';
  if (change <= -thresholdPct) return 'drop';
  return 'stable';
}
export function validateFlightInput(input) {
  const errors = {};
  if (!/^[A-Z]{3}$/.test(String(input.departure || '').toUpperCase())) errors.departure = 'Use a 3-letter IATA airport code.';
  if (!/^[A-Z]{3}$/.test(String(input.arrival || '').toUpperCase())) errors.arrival = 'Use a 3-letter IATA airport code.';
  if (input.departure && input.arrival && input.departure.toUpperCase() === input.arrival.toUpperCase()) errors.arrival = 'Origin and destination must differ.';
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = 'Enter a valid departure date.';
  if (!Number.isFinite(Number(input.price)) || Number(input.price) <= 0) errors.price = 'Price must be a positive number.';
  return errors;
}