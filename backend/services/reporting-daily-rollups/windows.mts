import { getMinUUIDv7ForDate } from '@modules/utils/ids'

const DAY_MS = 86_400_000

export function getReportingDayBounds(day: Date | string) {
  const date = new Date(day)
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid reporting day')
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const end = new Date(start.getTime() + DAY_MS)
  return {
    start,
    end,
    firstId: getMinUUIDv7ForDate(start),
    afterLastId: getMinUUIDv7ForDate(end),
  }
}

export function getReportingWindows(periodStart: Date, now = new Date()) {
  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(now.getTime())) {
    throw new RangeError('Invalid reporting window')
  }
  const todayStart = getReportingDayBounds(now).start
  const firstDay = getReportingDayBounds(periodStart)
  const partialEnd = new Date(Math.min(firstDay.end.getTime(), todayStart.getTime()))
  const firstPartial =
    periodStart > firstDay.start && periodStart < partialEnd
      ? { start: periodStart, end: partialEnd }
      : null
  return {
    firstPartial,
    completed: {
      start: new Date(
        Math.min((firstPartial ? firstDay.end : firstDay.start).getTime(), todayStart.getTime()),
      ),
      end: todayStart,
    },
    today: { start: new Date(Math.max(periodStart.getTime(), todayStart.getTime())), end: now },
  }
}
