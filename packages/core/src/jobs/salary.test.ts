import { describe, expect, it } from 'vitest';
import { salaryToMonthlyUsd } from './salary';

describe('salaryToMonthlyUsd', () => {
  it('keeps a monthly USD range', () => {
    expect(salaryToMonthlyUsd({ min: 3000, max: 4000, currency: 'USD', period: 'month' })).toEqual({ minUsd: 3000, maxUsd: 4000 });
  });
  it('converts yearly EUR to monthly USD', () => {
    expect(salaryToMonthlyUsd({ min: 60000, max: null, currency: 'eur', period: 'year' })).toEqual({ minUsd: 5400, maxUsd: null });
  });
  it('converts hourly rates with 168 hours a month', () => {
    expect(salaryToMonthlyUsd({ min: 25, max: 35, currency: 'USD', period: 'hour' })).toEqual({ minUsd: 4200, maxUsd: 5880 });
  });
  it('converts UAH and treats a missing period as monthly', () => {
    expect(salaryToMonthlyUsd({ min: 40000, max: 60000, currency: 'UAH', period: null })).toEqual({ minUsd: 964, maxUsd: 1446 });
  });
  it('converts PLN', () => {
    expect(salaryToMonthlyUsd({ min: 20000, max: 24000, currency: 'PLN', period: 'month' })).toEqual({ minUsd: 5000, maxUsd: 6000 });
  });
  it('rejects unknown or missing currency', () => {
    expect(salaryToMonthlyUsd({ min: 500000, max: null, currency: 'JPY', period: 'month' })).toBeNull();
    expect(salaryToMonthlyUsd({ min: 3000, max: null, currency: null, period: 'month' })).toBeNull();
  });
  it('swaps a reversed range and drops an implausibly wide max', () => {
    expect(salaryToMonthlyUsd({ min: 4000, max: 3000, currency: 'USD', period: 'month' })).toEqual({ minUsd: 3000, maxUsd: 4000 });
    expect(salaryToMonthlyUsd({ min: 1000, max: 9000, currency: 'USD', period: 'month' })).toEqual({ minUsd: 1000, maxUsd: null });
  });
  it('rejects empty and implausible values', () => {
    expect(salaryToMonthlyUsd({ min: null, max: null, currency: 'USD', period: 'month' })).toBeNull();
    expect(salaryToMonthlyUsd({ min: 0, max: null, currency: 'USD', period: 'month' })).toBeNull();
    expect(salaryToMonthlyUsd({ min: 50, max: null, currency: 'USD', period: 'month' })).toBeNull();
    expect(salaryToMonthlyUsd({ min: 200000, max: null, currency: 'USD', period: 'month' })).toBeNull();
  });
});
