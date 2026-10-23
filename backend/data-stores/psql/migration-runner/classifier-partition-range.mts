import { getMinUUIDv7ForDate } from '@modules/utils/ids'

export type ClassifierPartitionRangeInput = {
  fromDate: string
  toDate: string
  maxDefaultRows?: number
}

/** One operator request touches three aligned result tables and at most this many DEFAULT rows per table. */
export const CLASSIFIER_PARTITION_MAX_DEFAULT_ROWS = 5_000
export const CLASSIFIER_PARTITION_MAX_TOTAL_ROWS = 15_000

export function parseClassifierPartitionRange(input: ClassifierPartitionRangeInput) {
  const fromDate = parseUtcCalendarDate(input.fromDate)
  const toDate = parseUtcCalendarDate(input.toDate)
  if (fromDate >= toDate) throw new Error('Classifier partition range must have a later end')
  const maxDefaultRows = input.maxDefaultRows ?? CLASSIFIER_PARTITION_MAX_DEFAULT_ROWS
  if (
    !Number.isSafeInteger(maxDefaultRows) ||
    maxDefaultRows < 1 ||
    maxDefaultRows > CLASSIFIER_PARTITION_MAX_DEFAULT_ROWS
  ) {
    throw new Error('Classifier partition row budget is outside the supported range')
  }
  return {
    fromDate,
    toDate,
    fromId: getMinUUIDv7ForDate(fromDate),
    toId: getMinUUIDv7ForDate(toDate),
    nameSuffix: `r_${input.fromDate.replaceAll('-', '')}_${input.toDate.replaceAll('-', '')}`,
    maxDefaultRows,
  }
}

function parseUtcCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected a UTC calendar date')
  const date = new Date(`${value}T00:00:00.000Z`)
  if (date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1970) {
    throw new Error('Invalid UTC calendar date')
  }
  return date
}
