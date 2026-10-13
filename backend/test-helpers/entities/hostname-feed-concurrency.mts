import type { TransactionQuery } from '@data-stores/psql'
import type { DomainBlacklistSourceId } from '@voucha/types/entities/domain-blacklist-source'
import sql from 'sql-template-strings'

/** Simulate a replica missing this test's already-committed hostname row. */
export function hideTestHostnameFromReplicaRead(
  query: TransactionQuery,
  hostname: string,
): TransactionQuery {
  return new Proxy(query, {
    apply(target, thisArgument, argumentsList: Parameters<TransactionQuery>) {
      const [input, values] = argumentsList
      const statement = typeof input === 'string' ? input : input.text
      if (
        statement.includes('SELECT id, hostname FROM url_hostnames') &&
        values?.includes(hostname)
      ) {
        return target(
          '/* hideTestHostnameFromReplicaRead */ SELECT id, hostname FROM url_hostnames WHERE FALSE',
        )
      }
      return Reflect.apply(target, thisArgument, argumentsList)
    },
  })
}

/** Lift only this test's projected URL block inside its owned transaction. */
export async function liftTestProjectedHostnameBlock(
  sourceId: DomainBlacklistSourceId,
  hostnameId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* liftTestProjectedHostnameBlock */
    UPDATE url_hostname_blocks SET lifted_at = CURRENT_TIMESTAMP
    WHERE domain_blocklist_source_id = ${sourceId}
      AND url_hostname_id = ${hostnameId}
      AND lifted_at IS NULL
  `)
}

/** Prove that a projection transaction owns its affected hostname row lock. */
export async function lockTestHostnameNowait(
  hostnameId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockTestHostnameNowait */
    SELECT id FROM url_hostnames WHERE id = ${hostnameId} FOR UPDATE NOWAIT
  `)
}
