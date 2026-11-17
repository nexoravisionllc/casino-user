/**
 * Exact base-10 arithmetic for money, standing in for C#'s `decimal`.
 *
 * A value is an unscaled BigInt plus a scale (number of fractional digits).
 * Like `decimal`, it remembers its scale: 1000.00 - 10 is 990.00, and it reaches
 * JSON as 990.00. Binary floats cannot do this: 1.005 * 100 is 100.49999...,
 * which would round a commission down by a cent.
 */

const FORMAT = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

// Largest magnitude a C# decimal can hold.
const MAX_MAGNITUDE = 79228162514264337593543950335n;
const MAX_EXPONENT = 64;

const pow10 = (n) => 10n ** BigInt(n);

export class Decimal {
  constructor(unscaled, scale = 0) {
    this.unscaled = unscaled;
    this.scale = scale;
  }

  /** Parse "12.50", "-3", "1.5e2". Returns null when the text is not a number. */
  static tryParse(text) {
    const m = FORMAT.exec(String(text));
    if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null;
    // A decimal spans about 1e-28..1e28; refuse absurd exponents like 1e999999
    // before they turn into enormous BigInts.
    const exponent = Number(m[4] ?? 0);
    if (Math.abs(exponent) > MAX_EXPONENT) return null;
    const fraction = m[3] ?? '';
    let unscaled = BigInt((m[2] || '0') + fraction);
    if (m[1] === '-') unscaled = -unscaled;
    const scale = fraction.length - exponent;
    return scale >= 0 ? new Decimal(unscaled, scale) : new Decimal(unscaled * pow10(-scale), 0);
  }

  /** Parse a value that is known to be numeric, such as a DECIMAL column. */
  static from(value) {
    const d = Decimal.tryParse(value);
    if (!d) throw new TypeError(`Not a decimal value: ${value}`);
    return d;
  }

  /** False when the value would overflow a C# decimal. */
  get inRange() {
    const abs = this.unscaled < 0n ? -this.unscaled : this.unscaled;
    return abs / pow10(this.scale) <= MAX_MAGNITUDE;
  }

  #aligned(other) {
    const scale = Math.max(this.scale, other.scale);
    return [this.unscaled * pow10(scale - this.scale), other.unscaled * pow10(scale - other.scale), scale];
  }

  plus(other) {
    const [a, b, scale] = this.#aligned(other);
    return new Decimal(a + b, scale);
  }

  minus(other) {
    const [a, b, scale] = this.#aligned(other);
    return new Decimal(a - b, scale);
  }

  times(other) {
    return new Decimal(this.unscaled * other.unscaled, this.scale + other.scale);
  }

  /** This value divided by 100 (exact in base 10). */
  percent() {
    return new Decimal(this.unscaled, this.scale + 2);
  }

  negated() {
    return new Decimal(-this.unscaled, this.scale);
  }

  compareTo(other) {
    const [a, b] = this.#aligned(other);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  lessThan(other) { return this.compareTo(other) < 0; }
  greaterThan(other) { return this.compareTo(other) > 0; }

  get isPositive() { return this.unscaled > 0n; }

  /** Round to `places` digits, midpoints away from zero (MidpointRounding.AwayFromZero). */
  rounded(places) {
    if (this.scale <= places) return new Decimal(this.unscaled * pow10(places - this.scale), places);
    const divisor = pow10(this.scale - places);
    const half = divisor / 2n;
    const negative = this.unscaled < 0n;
    const abs = negative ? -this.unscaled : this.unscaled;
    const quotient = (abs + half) / divisor;
    return new Decimal(negative ? -quotient : quotient, places);
  }

  /** The "F2" format: exactly `places` decimals, midpoints away from zero. */
  toFixed(places) {
    return this.rounded(places).toString();
  }

  /** The digits as held, keeping trailing zeros ("12.50"). */
  toString() {
    const negative = this.unscaled < 0n;
    const digits = (negative ? -this.unscaled : this.unscaled).toString().padStart(this.scale + 1, '0');
    const whole = digits.slice(0, digits.length - this.scale);
    const text = this.scale > 0 ? `${whole}.${digits.slice(-this.scale)}` : whole;
    return negative ? `-${text}` : text;
  }

  /** Emit the exact digits as a JSON number. */
  toJSON() {
    return JSON.rawJSON(this.toString());
  }
}

export const ZERO = new Decimal(0n, 0);

/** A BIGINT id as an exact JSON number; null stays null. */
export const longJson = (v) => (v == null ? null : JSON.rawJSON(String(v)));

/** A DECIMAL column as an exact JSON number; null stays null. */
export const decimalJson = (v) => (v == null ? null : Decimal.from(v));
