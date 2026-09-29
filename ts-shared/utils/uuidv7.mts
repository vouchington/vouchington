// Maximum timestamp that fits in a UUIDv7 (48 bits). Inclusive.
const MAX_UUIDV7_TIMESTAMP_MS = 0xffffffffffff

/**
 * UUIDv7 lower bound for a millisecond timestamp.
 * Layout: tttttttt-tttt-7xxx-yxxx-xxxxxxxxxxxx, with the random bits zeroed.
 *
 * Accepts every integer from 0 through 0xffffffffffff.
 */
export function timestampToUuidv7LowerBound(timestampMs: number): string {
  if (timestampMs < 0) {
    throw new Error('Timestamp must be non-negative')
  }
  if (!Number.isSafeInteger(timestampMs)) {
    throw new Error('Timestamp must be a safe integer')
  }
  if (timestampMs > MAX_UUIDV7_TIMESTAMP_MS) {
    throw new Error('Timestamp exceeds UUIDv7 48-bit limit')
  }

  const timestampHex = timestampMs.toString(16).padStart(12, '0')
  const timeLow = timestampHex.slice(0, 8)
  const timeMid = timestampHex.slice(8, 12)
  return `${timeLow}-${timeMid}-7000-8000-000000000000`
}
