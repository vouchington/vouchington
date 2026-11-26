import sql from 'sql-template-strings'
import { beginTransaction, registerPostCommitAction } from '@data-stores/psql/setup'
import { write } from '@data-stores/psql'

type PostCommitAction = () => Promise<void>

export async function runExplicitCommitActionProbe(action: PostCommitAction): Promise<boolean> {
  let ranBeforeCommit = false
  await using transaction = await beginTransaction()
  registerPostCommitAction(transaction, async () => {
    ranBeforeCommit = true
    await action()
  })
  await transaction(sql`/* post-commit actions explicit commit */ SELECT 1`)
  const actionRanBeforeCommit = ranBeforeCommit
  await transaction.commit()
  return actionRanBeforeCommit
}

/** A real committed row distinguishes action failure from transaction failure. */
export async function runTransactionActionSettlementProbe(
  actions: PostCommitAction[],
): Promise<boolean> {
  let id: string | undefined
  try {
    await using transaction = await beginTransaction()
    const inserted = await transaction<{
      id: string
    }>(sql`/* runTransactionActionSettlementProbe insert */
      INSERT INTO url_hostnames (hostname) VALUES (${`actions-${crypto.randomUUID()}.example.com`})
      RETURNING id
    `)
    id = inserted.rows[0].id
    for (const action of actions) registerPostCommitAction(transaction, action)
    await transaction.commit()
    const persisted = await write(sql`/* runTransactionActionSettlementProbe read */
      SELECT id FROM url_hostnames WHERE id = ${id}::uuid
    `)
    return persisted.rows.length === 1
  } finally {
    if (id)
      await write(sql`/* runTransactionActionSettlementProbe cleanup */
      DELETE FROM url_hostnames WHERE id = ${id}::uuid
    `)
  }
}
