import { writePool } from '@data-stores/psql'
import { runConfigDrivenStatementsInTransaction } from '../../../data-stores/psql/migration-runner/config-driven-statements.mts'
import { write } from '../../../data-stores/psql/setup.mts'

export async function runLegacySentimentZeroVoteMigration(sql: string): Promise<void> {
  const client = await writePool.connect()
  try {
    await runConfigDrivenStatementsInTransaction(sql, (query, values) =>
      write(query, values, { client }),
    )
    await client.query('SELECT score_is_neutral, score_is_semantic FROM post_votes LIMIT 0')
  } finally {
    client.release()
  }
}
