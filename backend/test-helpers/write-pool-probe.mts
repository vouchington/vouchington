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
  const heldClients = await Promise.all(
    Array.from({ length: clientsToHold }, () => writePool.connect()),
  )

  try {
    return await callback()
  } finally {
    for (const client of heldClients) client.release()
  }
}
