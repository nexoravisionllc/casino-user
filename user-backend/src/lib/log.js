const stamp = () => new Date().toISOString();

// AggregateError (e.g. ECONNREFUSED on both ::1 and 127.0.0.1) has an empty message.
const reason = (err) =>
  err.message || err.code || err.errors?.map((e) => e.message || e.code).join('; ') || String(err);

const detail = (err) => (err ? ` ${reason(err)}${err.stack ? `\n${err.stack.split('\n').slice(1).join('\n')}` : ''}` : '');

export const log = {
  info: (msg) => console.log(`${stamp()} info: ${msg}`),
  warn: (msg, err) => console.warn(`${stamp()} warn: ${msg}${err ? ` ${reason(err)}` : ''}`),
  error: (msg, err) => console.error(`${stamp()} fail: ${msg}${detail(err)}`),
};
