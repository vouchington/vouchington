import type { QueryOptions } from '@data-stores/psql'

export async function ownsReportResolutionTransaction(
  queryOptions: QueryOptions | undefined,
): Promise<boolean> {
  if (queryOptions?.query) return false
  const client = queryOptions?.client
  if (!client) return true
  if ('release' in client) return !(await isPoolClientInTransaction(client))
  if ('connect' in client) return true
  return !(await isPoolClientInTransaction(client))
}

async function isPoolClientInTransaction(client: { query: (sql: string) => Promise<unknown> }) {
  try {
    // Do not replace with getTransactionStatus(); see reference-transactions.md and #9805.
    await client.query('SAVEPOINT voucha_report_resolution_probe')
    await client.query('RELEASE SAVEPOINT voucha_report_resolution_probe')
    return true
  } catch (error) {
    if ((error as { code?: string }).code === '25P01') return false
    throw error
  }
}
