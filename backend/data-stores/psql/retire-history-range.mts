import {
  isExplicitHistoryRangeTable,
  retireExplicitHistoryRange,
} from './migration-runner/explicit-range-retirement.mts'
import { close } from './runtime.mts'

/** Manual operator entrypoint; the named child and both bounds must match the live catalog. */
export async function runRetireHistoryRange(argv: string[]): Promise<void> {
  const [table, partition, fromId, toId, ...extra] = argv
  if (
    !table ||
    !isExplicitHistoryRangeTable(table) ||
    !partition ||
    !fromId ||
    !toId ||
    extra.length > 0
  ) {
    throw new Error('Usage: retire-history-range <table> <partition> <from-uuidv7> <to-uuidv7>')
  }
  const refusal = await retireExplicitHistoryRange({
    table,
    partition,
    fromId,
    toId,
  })
  if (refusal) throw new Error(`History range retirement refused: ${refusal}`)
  console.info(`Retired ${table}.${partition}`)
}

if (import.meta.main) {
  await runRetireHistoryRange(process.argv.slice(2)).finally(close)
}
