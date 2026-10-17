/**
 * Called only after Ajv's full date-time validator accepts the value. This enforces structural
 * UTC month-end placement, not IERS announcement verification or future insertion prediction.
 */
export function hasValidLeapSecondPlacement(value: string): boolean {
  const [date, time] = value.split(/t|\s/i)
  const parts = /^(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:z|([+-])(\d\d)(?::?(\d\d))?)$/i.exec(time!)
  if (!parts) return false
  if (Number(parts[3]) < 60) return true
  const year = Number(date!.slice(0, 4))
  const month = Number(date!.slice(5, 7))
  const day = Number(date!.slice(8, 10))
  const sign = parts[4] === '-' ? -1 : 1
  const offset = sign * (Number(parts[5] ?? 0) * 60 + Number(parts[6] ?? 0))
  const utcMinute = Number(parts[1]) * 60 + Number(parts[2]) - offset
  // An accepted leap-second minute is either 23:59 on this date, or 23:59 on the prior date.
  // Local day one therefore rolls back to the previous month's final day, including January.
  if (utcMinute === -1) return day === 1
  if (utcMinute !== 1439) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day === days[month - 1]
}
