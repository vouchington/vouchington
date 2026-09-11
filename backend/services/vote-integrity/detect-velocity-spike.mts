import { assertWhitelistedSqlIdentifier, read } from '@data-stores/psql'
import {
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import {
  VELOCITY_SPIKE_THRESHOLD,
  VELOCITY_SPIKE_WINDOW_MINUTES,
  YOUNG_ACCOUNT_AGE_DAYS,
  ENTITY_VOTE_TABLES,
} from './config.mts'

type VelocitySpikeResult = {
  flagged: boolean
  details: {
    young_account_vote_count: number
    threshold: number
    window_minutes: number
    young_account_age_days: number
  }
}

export async function detectVelocitySpike(
  entityType: string,
  entityId: string,
): Promise<VelocitySpikeResult> {
  const tableConfig = ENTITY_VOTE_TABLES[entityType]
  if (!tableConfig) {
    return {
      flagged: false,
      details: {
        young_account_vote_count: 0,
        threshold: VELOCITY_SPIKE_THRESHOLD,
        window_minutes: VELOCITY_SPIKE_WINDOW_MINUTES,
        young_account_age_days: YOUNG_ACCOUNT_AGE_DAYS,
      },
    }
  }

  const windowStart = new Date(Date.now() - VELOCITY_SPIKE_WINDOW_MINUTES * 60 * 1000)
  const lowerBoundId = getMinUUIDv7ForDate(windowStart)
  const youngAccountCutoff = new Date(Date.now() - YOUNG_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000)
  const youngAccountCutoffId = getMinUUIDv7ForDate(youngAccountCutoff)

  const query = sql`/* detectVelocitySpike */
    SELECT COUNT(DISTINCT v.user_id)::int AS young_account_vote_count
    FROM `
  query.append(
    assertWhitelistedSqlIdentifier(tableConfig.voteTable, VOTE_TABLE_IDENTIFIERS, 'voteTable'),
  )
  query.append(sql` v
    JOIN users u ON u.id = v.user_id
    WHERE v.`)
  query.append(
    assertWhitelistedSqlIdentifier(
      tableConfig.entityIdColumn,
      VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
      'entityIdColumn',
    ),
  )
  query.append(sql` = ${entityId}::uuid
      AND v.id >= ${lowerBoundId}
      AND u.id >= ${youngAccountCutoffId}
      AND u.deleted_at IS NULL
  `)

  const { rows } = await read(query)

  const youngAccountVoteCount = (rows[0]?.young_account_vote_count ?? 0) as number
  const flagged = youngAccountVoteCount > VELOCITY_SPIKE_THRESHOLD

  return {
    flagged,
    details: {
      young_account_vote_count: youngAccountVoteCount,
      threshold: VELOCITY_SPIKE_THRESHOLD,
      window_minutes: VELOCITY_SPIKE_WINDOW_MINUTES,
      young_account_age_days: YOUNG_ACCOUNT_AGE_DAYS,
    },
  }
}
