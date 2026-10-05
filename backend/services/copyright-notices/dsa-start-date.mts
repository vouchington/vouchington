/** Parse an operator-entered UTC calendar day without silently normalizing an invalid date. */
export function parseCopyrightDsaSorDatabaseFrom(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-'))
    return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? date : null
}
