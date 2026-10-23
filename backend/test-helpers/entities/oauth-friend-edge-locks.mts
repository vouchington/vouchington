import { beginTransaction, read, type OwnedTransaction } from '@data-stores/psql'

type FriendProvider = 'facebook' | 'github' | 'x'

export async function getTestFriendSyncStartTime(): Promise<string> {
  const { rows } = await read<{ now: string }>(
    '/* getTestFriendSyncStartTime */ SELECT CURRENT_TIMESTAMP::text AS now',
    [],
  )
  return rows[0]!.now
}

export async function holdTestOAuthAccountRow(
  provider: FriendProvider,
  accountId: string,
  mode: 'SHARE' | 'UPDATE',
): Promise<{ query: OwnedTransaction; release: () => Promise<void> }> {
  const query = await beginTransaction()
  try {
    const { rows } = await query(
      `/* holdTestOAuthAccountRow */ SELECT id FROM ${provider}_accounts
       WHERE id = $1::uuid FOR ${mode}`,
      [accountId],
    )
    if (!rows[0]) throw new Error('OAuth account row to lock is missing')
  } catch (err) {
    await query.rollback()
    throw err
  }
  return { query, release: () => query.commit() }
}
