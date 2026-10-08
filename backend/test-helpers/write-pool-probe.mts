import { write, writePool } from '@data-stores/psql'

export async function probeWritePool(value: number): Promise<number | undefined> {
  const result = await write<{ value: number }>(
    '/* testWritePoolProbe */ SELECT $1::int AS value',
    [value],
  )
  return result.rows[0]?.value
}

export async function withOnlyOneWritePoolClientAvailable<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const clientsToHold = Math.max(0, (writePool.options.max ?? 1) - 1)
  const acquired = await Promise.allSettled(
    Array.from({ length: clientsToHold }, () => writePool.connect()),
  )
  const heldClients = acquired.flatMap(item => (item.status === 'fulfilled' ? [item.value] : []))
  const failures: unknown[] = acquired.flatMap(item =>
    item.status === 'rejected' ? [item.reason] : [],
  )
  let result: T | undefined
  try {
    if (!failures.length) result = await callback()
  } catch (err) {
    failures.push(err)
  } finally {
    for (const client of heldClients) {
      try {
        client.release()
      } catch (err) {
        failures.push(err)
      }
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Write-pool probe and release failed')
  return result as T
}
