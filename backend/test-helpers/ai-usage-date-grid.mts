export const AI_USAGE_DAY_MS = 24 * 60 * 60 * 1000
export const AI_USAGE_SLOT_DAYS = 3
export const AI_USAGE_SLOT_MS = AI_USAGE_SLOT_DAYS * AI_USAGE_DAY_MS
const ORDINARY_SLOT_COUNT = 25
const CONTROL_SLOT_STRIDE = 7
// At most five control blocks occur among thirty aligned blocks.
const CANDIDATE_COUNT = 30

/** Epoch-aligned blocks retain one ownership key across clocks, months and selection modes. */
export function getTestAiUsageSlotGridForDate(
  date: Date,
  options: { notBefore?: Date } = {},
): { controlSlot: number; ordinarySlots: number[] } {
  if (
    !Number.isFinite(date.getTime()) ||
    (options.notBefore && !Number.isFinite(options.notBefore.getTime()))
  ) {
    throw new TypeError('AI usage reservation dates must be valid')
  }
  const dayStart = Math.floor(date.getTime() / AI_USAGE_DAY_MS) * AI_USAGE_DAY_MS
  const lastPastSlot = Math.floor((dayStart - AI_USAGE_DAY_MS) / AI_USAGE_SLOT_MS) - 1
  const controlSlot = Math.floor(lastPastSlot / CONTROL_SLOT_STRIDE) * CONTROL_SLOT_STRIDE
  const firstSlot = options.notBefore
    ? Math.ceil(
        Math.max(
          dayStart + 2 * AI_USAGE_DAY_MS,
          options.notBefore.getTime() - 1.5 * AI_USAGE_DAY_MS,
        ) / AI_USAGE_SLOT_MS,
      )
    : lastPastSlot
  const direction = options.notBefore ? 1 : -1
  const ordinarySlots = Array.from(
    { length: CANDIDATE_COUNT },
    (_, offset) => firstSlot + direction * offset,
  )
    .filter(slot => slot % CONTROL_SLOT_STRIDE !== 0)
    .slice(0, ORDINARY_SLOT_COUNT)
    .toSorted((a, b) => a - b)
  return { controlSlot, ordinarySlots }
}

/** Monthly preparation includes every day owned by a block, not just its middle test day. */
export function getTestAiUsageReservationMonths(date: Date): Date[] {
  const { controlSlot, ordinarySlots } = getTestAiUsageSlotGridForDate(date)
  const forward = getTestAiUsageSlotGridForDate(date, { notBefore: date }).ordinarySlots
  const months = new Map<number, Date>()
  for (const slot of [...ordinarySlots, controlSlot, ...forward]) {
    for (const timestamp of [slot * AI_USAGE_SLOT_MS, (slot + 1) * AI_USAGE_SLOT_MS - 1]) {
      const day = new Date(timestamp)
      const month = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)
      months.set(month, new Date(month))
    }
  }
  return [...months.values()].toSorted((a, b) => a.getTime() - b.getTime())
}
