import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'

export async function markPostPublicationTypedProtocol(query: TransactionQuery): Promise<void> {
  await query(
    `/* markPostPublicationTypedProtocol */ SELECT set_config('voucha.post_publication_protocol', 'typed-v1', true)`,
  )
  await query(
    `/* lockPostPublicationIdentityProtocol */ SELECT singleton FROM post_publication_identity_protocol WHERE singleton FOR SHARE`,
  )
}

export async function isPostPublicationTypedProtocolActive(
  query?: TransactionQuery,
): Promise<boolean> {
  const { rows } = await (query ?? write)<{
    protocol_version: string
  }>(`/* isPostPublicationTypedProtocolActive */
    SELECT protocol_version FROM post_publication_identity_protocol WHERE singleton`)
  return rows[0]?.protocol_version === 'typed-v1'
}

export async function activatePostPublicationTypedProtocol(): Promise<void> {
  await using query = await beginTransaction()
  await query(`/* activatePostPublicationTypedProtocol */ UPDATE post_publication_identity_protocol
    SET protocol_version = 'typed-v1', activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP) WHERE singleton`)
  await query.commit()
}

/** Marks and executes a single guarded write in the same transaction. */
export async function writePostPublicationProtocol<
  Row extends Record<string, unknown> = Record<string, unknown>,
>(...args: Parameters<TransactionQuery>) {
  await using query = await beginTransaction()
  await markPostPublicationTypedProtocol(query)
  const result = await query<Row>(...args)
  await query.commit()
  return result
}
