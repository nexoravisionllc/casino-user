import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Decimal } from '../src/lib/decimal.js';

const d = (s) => Decimal.from(s);

test('parses and keeps the scale of the input', () => {
  assert.equal(d('12.50').toString(), '12.50');
  assert.equal(d('5').toString(), '5');
  assert.equal(d('0.07').toString(), '0.07');
  assert.equal(d('-0.07').toString(), '-0.07');
  assert.equal(d('1.5e2').toString(), '150');
  assert.equal(d('1.50e1').toString(), '15.0');
  assert.equal(d('15e-1').toString(), '1.5');
  assert.equal(d('.5').toString(), '0.5');
});

test('rejects text that is not a number and absurd exponents', () => {
  for (const bad of ['', '.', 'abc', '1,5', '1.2.3', '--1', '0x10', '1e', '1e999999'])
    assert.equal(Decimal.tryParse(bad), null, `should reject ${JSON.stringify(bad)}`);
});

test('add and subtract are exact and use the larger scale', () => {
  assert.equal(d('0.1').plus(d('0.2')).toString(), '0.3');
  assert.equal(d('1000.00').minus(d('10')).toString(), '990.00');
  assert.equal(d('1000.00').plus(d('10.5')).toString(), '1010.50');
  assert.equal(d('1000.00').minus(d('1.234')).toString(), '998.766');
  assert.equal(d('10').minus(d('25.50')).toString(), '-15.50');
});

test('keeps digits a double cannot hold', () => {
  assert.equal(d('90071992547409.93').plus(d('0.01')).toString(), '90071992547409.94');
});

test('rounds midpoints away from zero', () => {
  assert.equal(d('0.125').rounded(2).toString(), '0.13');
  assert.equal(d('-0.125').rounded(2).toString(), '-0.13');
  assert.equal(d('1.005').rounded(2).toString(), '1.01');
  assert.equal(d('2.675').rounded(2).toString(), '2.68');
  assert.equal(d('0.004').rounded(2).toString(), '0.00');
  assert.equal(d('0.005').rounded(2).toString(), '0.01');
  assert.equal(d('1.5').rounded(2).toString(), '1.50');
});

test('computes a commission exactly where floats fail', () => {
  // 1.15 * 1.5 / 100 = 0.01725, and 100.5 * 1 / 100 = 1.005 (a float gives 1.00).
  assert.equal(d('1.15').times(d('1.5').minus(d('0'))).percent().rounded(2).toString(), '0.02');
  assert.equal(d('100.5').times(d('1')).percent().rounded(2).toString(), '1.01');
});

test('toFixed formats like F2', () => {
  assert.equal(d('100').toFixed(2), '100.00');
  assert.equal(d('4.000').toFixed(2), '4.00');
  assert.equal(d('1.125').toFixed(2), '1.13');
});

test('compares across scales', () => {
  assert.equal(d('1.10').compareTo(d('1.1')), 0);
  assert.ok(d('1.1').lessThan(d('1.11')));
  assert.ok(d('2').greaterThan(d('1.99')));
  assert.equal(d('0.00').isPositive, false);
  assert.equal(d('-1').isPositive, false);
  assert.equal(d('0.01').isPositive, true);
});

test('serializes to JSON as an exact number with its scale', () => {
  assert.equal(JSON.stringify({ balance: d('1000.00') }), '{"balance":1000.00}');
  assert.equal(JSON.stringify({ balance: d('-0.50') }), '{"balance":-0.50}');
});

test('reports values that would overflow a C# decimal', () => {
  assert.equal(d('79228162514264337593543950335').inRange, true);
  assert.equal(d('79228162514264337593543950336').inRange, false);
});
