import express from 'express';
import { Decimal, ZERO } from './decimal.js';

/**
 * Request binding that keeps the HTTP contract of the ASP.NET Core backend:
 * case-insensitive JSON properties, numbers accepted as numbers or numeric
 * strings, and RFC 9110 problem-details bodies for bad input.
 *
 * Bodies are parsed with losslessReviver, so `trans_id` (a 64-bit integer) and
 * `amount` keep every digit instead of passing through a binary float.
 */

export class RawNumber {
  constructor(source) {
    this.source = source;
  }
}

/** JSON.parse reviver that keeps each number's exact source text. */
export const losslessReviver = (key, value, context) =>
  (typeof value === 'number' ? new RawNumber(context.source) : value);

export class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
  }
}

export class UnsupportedMediaTypeError extends Error {}

export function problem(status, title, errors) {
  const body = {
    type: status === 400
      ? 'https://tools.ietf.org/html/rfc9110#section-15.5.1'
      : `https://tools.ietf.org/html/rfc9110#section-15.5.${status - 399}`,
    title,
    status,
  };
  if (errors) body.errors = errors;
  return body;
}

export const validationProblem = (field, message) =>
  problem(400, 'One or more validation errors occurred.', { [field]: [message] });

export const isBlank = (v) => v == null || String(v).trim() === '';

const LONG = /^-?\d+$/;
const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;
const QUOTED_NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof RawNumber);

class Body {
  #fields;
  #path;

  constructor(source, path = '$') {
    this.#fields = new Map(Object.entries(source).map(([k, v]) => [k.toLowerCase(), v]));
    this.#path = path;
  }

  #has(name) { return this.#fields.has(name.toLowerCase()); }
  #get(name) { return this.#fields.get(name.toLowerCase()); }

  #required(name) {
    return new ValidationError(name, `The ${name} field is required.`);
  }

  #invalid(name, type) {
    const path = `${this.#path}.${name}`;
    return new ValidationError(path, `The JSON value could not be converted to ${type}. Path: ${path}`);
  }

  #string(name, value) {
    if (typeof value !== 'string') throw this.#invalid(name, 'System.String');
    return value;
  }

  /** A non-nullable record parameter: absent or null is a validation error. */
  requiredStr(name) {
    const v = this.#get(name);
    if (v == null) throw this.#required(name);
    return this.#string(name, v);
  }

  /** A nullable string: absent or null is null. */
  optionalStr(name) {
    const v = this.#get(name);
    return v == null ? null : this.#string(name, v);
  }

  /** A non-nullable class property with a "" default: only an explicit null is invalid. */
  str(name) {
    if (!this.#has(name)) return '';
    const v = this.#get(name);
    if (v === null) throw this.#required(name);
    return this.#string(name, v);
  }

  /** A `decimal`: absent is 0; null or a non-number is invalid. */
  decimal(name) {
    if (!this.#has(name)) return ZERO;
    const v = this.#get(name);
    const text = v instanceof RawNumber ? v.source
      : typeof v === 'string' && QUOTED_NUMBER.test(v) ? v
      : null;
    const parsed = text == null ? null : Decimal.tryParse(text);
    if (!parsed?.inRange) throw this.#invalid(name, 'System.Decimal');
    return parsed;
  }

  /** A `long`, returned as digit text: absent is "0"; null or a non-integer is invalid. */
  long(name) {
    if (!this.#has(name)) return '0';
    const v = this.#get(name);
    const text = v instanceof RawNumber ? v.source : typeof v === 'string' ? v : '';
    if (!LONG.test(text)) throw this.#invalid(name, 'System.Int64');
    const value = BigInt(text);
    if (value < LONG_MIN || value > LONG_MAX) throw this.#invalid(name, 'System.Int64');
    return value.toString();
  }

  /** A nested object with a default instance: absent is empty, null is invalid. */
  object(name) {
    if (!this.#has(name)) return new Body({}, `${this.#path}.${name}`);
    const v = this.#get(name);
    if (v === null) throw this.#required(name);
    if (!isObject(v)) throw this.#invalid(name, 'Object');
    return new Body(v, `${this.#path}.${name}`);
  }
}

/** Typed view of a [FromBody] JSON request body. */
export function bodyOf(req) {
  if (req.body === undefined) {
    if (req.get('content-type') && req.is(JSON_TYPES)) throw new ValidationError('', 'A non-empty request body is required.');
    throw new UnsupportedMediaTypeError();
  }
  if (req.get('content-length') === '0') throw new ValidationError('', 'A non-empty request body is required.');
  if (!isObject(req.body)) throw new ValidationError('$', 'The JSON value could not be converted to the request type.');
  return new Body(req.body);
}

const JSON_TYPES = ['application/json', 'text/json', 'application/*+json'];

/** Parses a JSON request body without losing numeric precision. */
export const jsonBody = express.json({ limit: '1mb', type: JSON_TYPES, reviver: losslessReviver });

const INT = /^\s*[+-]?\d+\s*$/;
const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;

/** A [FromQuery] int: absent uses the default; anything unparseable is a 400. */
export function queryInt(req, name, fallback) {
  const raw = req.query[name];
  if (raw === undefined) return fallback;
  const text = Array.isArray(raw) ? raw[0] : raw;
  const value = INT.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(value) || value < INT_MIN || value > INT_MAX)
    throw new ValidationError(name, `The value '${text}' is not valid.`);
  return value;
}

/** A [FromQuery] string: absent is null. */
export function queryStr(req, name) {
  const raw = req.query[name];
  if (raw === undefined) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

export const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
