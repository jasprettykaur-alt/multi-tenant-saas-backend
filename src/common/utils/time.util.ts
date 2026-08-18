const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Parses simple durations like '15m', '7d', '60s' into milliseconds. */
export function parseDurationToMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration format: ${value}`);
  }
  const [, amount, unit] = match;
  return parseInt(amount, 10) * UNIT_MS[unit];
}
