import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { clearUnlinkedTopicAliasCategories } from './clear-unlinked-topic-alias-categories.mts'

/**
 * Removes mappings for an alias transition delivered directly by the topic-alias worker.
 * Durable reconciliation supplies the authored alias text when an ordinary alias was deleted.
 */
export async function clearCategoriesForUnlinkedTopicAlias(
  topicAliasId: string,
  formerTopicId: string,
  options: QueryOptions = {},
): Promise<{ updated: number }> {
  const run = (query: TransactionQuery) =>
    query<{ alias: string; topic_id: string | null }>(
      `/* clearCategoriesForUnlinkedTopicAlias.alias */
        SELECT alias, topic_id
        FROM topic_aliases
        WHERE id = $1`,
      [topicAliasId],
    )

  const { rows } = await runInTransaction(options, run)
  const alias = rows[0]
  if (!alias || alias.topic_id !== null) return { updated: 0 }
  return clearUnlinkedTopicAliasCategories(topicAliasId, alias.alias, formerTopicId, options)
}

async function runInTransaction<Result>(
  options: QueryOptions,
  run: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
