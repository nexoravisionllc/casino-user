/**
 * Date formatting that matches what the ASP.NET Core backend put on the wire:
 * dates read from the database had no time zone (DateTimeKind.Unspecified), so
 * they serialize without a trailing "Z", e.g. "2025-01-31T09:15:00.123".
 */

// "....30.120" -> "....30.12", "....30.000" -> "....30"
const trimFraction = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

/** A DATETIME column value ("YYYY-MM-DD hh:mm:ss[.ffffff]") as ISO text; null stays null. */
export const dbDate = (v) => (v == null ? null : trimFraction(String(v).trim().replace(' ', 'T')));
