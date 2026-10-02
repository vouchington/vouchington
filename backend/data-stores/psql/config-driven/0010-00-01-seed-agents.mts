import { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'
import {
  BAN_EVASION_SYSTEM_USERNAME,
  MODERATION_SYSTEM_USERNAME,
} from '@voucha/types/entities/user-constants'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

// Agent system users that need user rows (but no admin role).
const AGENT_SYSTEM_USERS = [
  'autotagger',
  MODERATION_SYSTEM_USERNAME,
  BAN_EVASION_SYSTEM_USERNAME,
  'rss-feed-auto-updater',
  'story-teller',
  // Official Voucha account — owns platform-level referral links.
  'voucha',
  ...MODERATOR_CONFIGS.map(c => c.slug),
]

/** @public loaded by path by the config-driven migration runner */
export default function generateSeedAgentsSQL(): string {
  const parts: string[] = ['-- Ensure agent system users and agent rows during db:migrate']

  // 1. Upsert the system user (needed as created_by_id for agents).
  // Uses the same reclaim-then-upsert as upsertSystemUser in backend/services/users/system-users.mts.
  parts.push(buildSystemUserUpsertSQL('system'))

  // 2. Upsert each agent system user (no admin role).
  for (const username of AGENT_SYSTEM_USERS) {
    parts.push(buildSystemUserUpsertSQL(username))
  }

  // 3. Upsert moderator agent rows.
  for (const config of MODERATOR_CONFIGS) {
    parts.push(`
INSERT INTO agents (system_user_id, agent_type, activated_at, created_by_id)
SELECT
  u.id,
  'moderator',
  CURRENT_TIMESTAMP,
  (SELECT id FROM users WHERE username = 'system')
FROM users u
WHERE u.username = '${config.slug}'
ON CONFLICT (system_user_id) DO UPDATE SET
  activated_at = COALESCE(agents.activated_at, CURRENT_TIMESTAMP),
  deactivated_at = NULL,
  deleted_at = NULL;`)
  }

  // 4. Upsert the autotagger agent row (agent_type: 'autotagger').
  parts.push(`
INSERT INTO agents (system_user_id, agent_type, activated_at, created_by_id)
SELECT
  u.id,
  'autotagger',
  CURRENT_TIMESTAMP,
  (SELECT id FROM users WHERE username = 'system')
FROM users u
WHERE u.username = 'autotagger'
ON CONFLICT (system_user_id) DO UPDATE SET
  activated_at = COALESCE(agents.activated_at, CURRENT_TIMESTAMP),
  deactivated_at = NULL,
  deleted_at = NULL;`)

  parts.push(`
INSERT INTO agents (system_user_id, agent_type, activated_at, created_by_id)
SELECT
  u.id,
  'storyteller',
  CURRENT_TIMESTAMP,
  (SELECT id FROM users WHERE username = 'system')
FROM users u
WHERE u.username = 'story-teller'
ON CONFLICT (system_user_id) DO UPDATE SET
  activated_at = COALESCE(agents.activated_at, CURRENT_TIMESTAMP),
  deactivated_at = NULL,
  deleted_at = NULL;`)

  // 5. Upsert agents__moderators rows. The C5 classifiers are record-only (the community action is
  // communities.automod_action). Their prompt, model and provider are seeded by
  // 0635-00-03-seed-post-classifier, so no per-moderator agent_prompts rows exist.
  for (const config of MODERATOR_CONFIGS) {
    parts.push(`
INSERT INTO agents__moderators (agent_id, slug, is_baseline)
SELECT
  a.id,
  '${config.slug}',
  ${config.baseline}
FROM agents a
JOIN users u ON u.id = a.system_user_id
WHERE u.username = '${config.slug}'
ON CONFLICT (agent_id) DO UPDATE SET
  slug = EXCLUDED.slug,
  is_baseline = EXCLUDED.is_baseline;`)
  }

  return parts.join('\n')
}
