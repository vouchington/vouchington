import {
  RSS_FEED_CATEGORIZER_USERNAME,
  RSS_FEED_COLLABORATIVE_CATEGORIZER_USERNAME,
} from '@voucha/types/entities/user-constants'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

/**
 * Seeds the RSS category-source system users with a low vote weight (0.01).
 * vote_weight_admin_set_at pins the weight against auto-recalculation so the
 * low signal is never overridden. The autotagger upvotes feed-mapped categories
 * it agrees with, raising their net score to 1.01+.
 *
 * Routes through buildSystemUserUpsertSQL so the reserved username is reclaimed from any
 * non-system squatter before the system row is (re)upserted; the generic helper does not set
 * vote_weight, so a separate idempotent follow-up statement pins it here.
 */
export default function generateSeedCategorizerSQL(): string {
  return [RSS_FEED_CATEGORIZER_USERNAME, RSS_FEED_COLLABORATIVE_CATEGORIZER_USERNAME]
    .map(
      username => `${buildSystemUserUpsertSQL(username)}

UPDATE users
SET vote_weight = 0.01
WHERE username = '${username}' AND is_system = TRUE;`,
    )
    .join('\n\n')
}
