import { describe, it, expect } from 'vitest';
import { classifyMovement, formatINR, percentChange, validateFlightInput } from './prices';

describe('percentChange', () => {
  it('calculates percentage movement', () => expect(percentChange(20000, 18000)).toBe(-10));
  it('handles invalid baselines', () => expect(percentChange(0, 100)).toBeNull());
});
describe('classifyMovement', () => {
  it('detects meaningful drops and surges', () => {
    expect(classifyMovement(20000, 18000)).toBe('drop');
    expect(classifyMovement(20000, 22000)).toBe('surge');
  });
  it('ignores small movement', () => expect(classifyMovement(20000, 19500)).toBe('stable'));
});
describe('validateFlightInput', () => {
  it('accepts a valid route and fare', () => {
    expect(validateFlightInput({departure:'IXC',arrival:'SHJ',date:'2026-11-12',price:'18450'})).toEqual({});
  });
  it('rejects same airport and non-positive prices', () => {
    const errors = validateFlightInput({departure:'IXC',arrival:'IXC',date:'2026-11-12',price:'0'});
    expect(errors.arrival).toBeTruthy();
    expect(errors.price).toBeTruthy();
  });
});
describe('formatINR', () => {
  it('formats Indian rupees', () => expect(formatINR(18450)).toContain('18,450'));
  it('handles missing data', () => expect(formatINR(NaN)).toBe('—'));
});