import { assertWhitelistedSqlIdentifier, read } from '@data-stores/psql'
import {
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import {
  IP_CORRELATION_THRESHOLD,
  IP_CORRELATION_WINDOW_MINUTES,
  ENTITY_VOTE_TABLES,
} from './config.mts'

type IpCorrelationDetail = {
  ip_address: string
  distinct_user_count: number
}

type IpCorrelationResult = {
  flagged: boolean
  details: {
    correlated_ips: IpCorrelationDetail[]
    threshold: number
    window_minutes: number
  }
}

export async function detectIpCorrelation(
  entityType: string,
  entityId: string,
): Promise<IpCorrelationResult> {
  const tableConfig = ENTITY_VOTE_TABLES[entityType]
  if (!tableConfig) {
    return {
      flagged: false,
      details: {
        correlated_ips: [],
        threshold: IP_CORRELATION_THRESHOLD,
        window_minutes: IP_CORRELATION_WINDOW_MINUTES,
      },
    }
  }

  const windowStart = new Date(Date.now() - IP_CORRELATION_WINDOW_MINUTES * 60 * 1000)
  const lowerBoundId = getMinUUIDv7ForDate(windowStart)

  const query = sql`/* detectIpCorrelation */
    SELECT
      host(ip_address) AS ip_address,
      COUNT(DISTINCT user_id)::int AS distinct_user_count
    FROM `
  query.append(
    assertWhitelistedSqlIdentifier(tableConfig.voteTable, VOTE_TABLE_IDENTIFIERS, 'voteTable'),
  )
  query.append(sql`
    WHERE `)
  query.append(
    assertWhitelistedSqlIdentifier(
      tableConfig.entityIdColumn,
      VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
      'entityIdColumn',
    ),
  )
  query.append(sql` = ${entityId}::uuid
      AND id >= ${lowerBoundId}
      AND ip_address IS NOT NULL
    GROUP BY ip_address
    HAVING COUNT(DISTINCT user_id) >= ${IP_CORRELATION_THRESHOLD}
    ORDER BY distinct_user_count DESC
  `)

  const { rows } = await read(query)

  const correlatedIps = rows as IpCorrelationDetail[]
  const flagged = correlatedIps.length > 0

  return {
    flagged,
    details: {
      correlated_ips: correlatedIps,
      threshold: IP_CORRELATION_THRESHOLD,
      window_minutes: IP_CORRELATION_WINDOW_MINUTES,
    },
  }
}
