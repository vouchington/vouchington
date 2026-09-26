import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** Fixture writes use the same explicit expanded-writer marker as deployed publication workers. */
export async function writeTestPostPublicationProtocol<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(...args: Parameters<TransactionQuery>) {
  await using query = await beginTransaction()
  await query(
    `/* markTestPostPublicationProtocol */ SELECT set_config('voucha.post_publication_protocol', 'typed-v1', true)`,
  )
  const result = await query<Row>(...args)
  await query.commit()
  return result
}
