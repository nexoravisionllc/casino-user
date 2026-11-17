import mysql from 'mysql2/promise';
import { config } from './config.js';

/**
 * Read/write access to the shared "Solution" MySQL database.
 *
 * Queries use named placeholders: db.query('... WHERE Uid = :id', { id: 5 }).
 * A SELECT resolves to its rows; INSERT / UPDATE / DELETE resolve to the
 * result header ({ insertId, affectedRows, ... }).
 *
 * This backend moves money, so nothing is read lossily: DECIMAL and BIGINT
 * columns arrive as strings (see lib/decimal.js) and DATETIME columns as text.
 * DATETIME columns hold UTC.
 */

export const connectionOptions = (overrides = {}) => ({
  ...(config.db.url
    ? { uri: config.db.url }
    : {
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
      }),
  charset: 'utf8mb4',
  timezone: 'Z',
  decimalNumbers: false,
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  ...overrides,
});

const pool = mysql.createPool(connectionOptions({
  namedPlaceholders: true,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
}));

export const db = {
  /** Run a parameterized statement: rows for a SELECT, the result header otherwise. */
  async query(text, params) {
    const [result] = await pool.query(text, params);
    return result;
  },

  /** Run fn({ query }) inside a transaction; commits on success, rolls back on throw. */
  async transaction(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn({ query: async (text, params) => (await conn.query(text, params))[0] });
      await conn.commit();
      return result;
    } catch (err) {
      try { await conn.rollback(); } catch { /* connection already gone */ }
      throw err;
    } finally {
      conn.release();
    }
  },

  close() {
    return pool.end();
  },
};

/** True for a unique key violation (ER_DUP_ENTRY). */
export const isUniqueViolation = (err) => err?.errno === 1062 || err?.code === 'ER_DUP_ENTRY';
