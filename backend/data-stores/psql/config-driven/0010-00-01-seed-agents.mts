import { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'
import {
  BAN_EVASION_SYSTEM_USERNAME,
  MODERATION_SYSTEM_USERNAME,
} from '@voucha/types/entities/user-constants'
import { buildModeratorPromptSyncSQL } from './utils/moderator-prompt-sync-sql.mts'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

// Agent system users that need user rows (but no admin role).
const AGENT_SYSTEM_USERS = [
  'autotagger',
  MODERATION_SYSTEM_USERNAME,
  BAN_EVASION_SYSTEM_USERNAME,
  'customer-support',
  'rss-feed-auto-updater',
  'story-teller',
  'wikipedia-recommender',
  // Official Voucha account — owns platform-level referral links.
  'voucha',
  ...MODERATOR_CONFIGS.map(c => c.slug),
]

export default function generateSeedAgentsSQL(): string {
  const parts: string[] = [
    '-- Ensure agent system users, agent rows, and moderator prompts during db:migrate',
    'ALTER TABLE agents__moderators ADD COLUMN IF NOT EXISTS is_baseline boolean NOT NULL DEFAULT FALSE;',
  ]

  // 1. Upsert the system user (needed as created_by_id for agents).
  // Uses the same reclaim-then-upsert as upsertSystemUser in backend/services/users/system-users.mts.
  parts.push(buildSystemUserUpsertSQL('system'))

  // 2. Upsert each agent system user (no admin role).
  for (const username of AGENT_SYSTEM_USERS) {
    parts.push(buildSystemUserUpsertSQL(username))
  }

  // 3. Grant least-privilege support role to the customer support agent user.
  parts.push(`
INSERT INTO user_roles (user_id, role_type_id)
SELECT u.id, urt.id
FROM users u
JOIN user_roles_types urt ON urt.slug = 'customer_support'
WHERE u.username = 'customer-support' AND u.is_system = TRUE
ON CONFLICT (user_id, role_type_id) DO NOTHING;`)

  // 4. Upsert moderator agent rows.
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

  // 5. Upsert the autotagger agent row (agent_type: 'autotagger').
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

  // 5c. Upsert the wikipedia-recommender agent row (agent_type: 'recommender').
  parts.push(`
INSERT INTO agents (system_user_id, agent_type, activated_at, created_by_id)
SELECT
  u.id,
  'recommender',
  CURRENT_TIMESTAMP,
  (SELECT id FROM users WHERE username = 'system')
FROM users u
WHERE u.username = 'wikipedia-recommender'
ON CONFLICT (system_user_id) DO UPDATE SET
  activated_at = COALESCE(agents.activated_at, CURRENT_TIMESTAMP),
  deactivated_at = NULL,
  deleted_at = NULL;`)

  parts.push(`ALTER TABLE agents__moderators
  ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN agents__moderators.is_baseline IS 'When true, this moderator runs on every approved post regardless of community opt-in (baseline safety net).';`)

  // 6. Upsert agents__moderators rows.
  for (const config of MODERATOR_CONFIGS) {
    parts.push(`
INSERT INTO agents__moderators (agent_id, slug, on_flag_action, is_baseline)
SELECT
  a.id,
  '${config.slug}',
  '${config.onFlagAction}',
  ${config.baseline}
FROM agents a
JOIN users u ON u.id = a.system_user_id
WHERE u.username = '${config.slug}'
ON CONFLICT (agent_id) DO UPDATE SET
  slug = EXCLUDED.slug,
  on_flag_action = EXCLUDED.on_flag_action,
  is_baseline = EXCLUDED.is_baseline;`)
  }

  // 7. Manage prompts: for each moderator, deactivate stale prompts and insert
  // the current one if it doesn't already exist as the active prompt.
  for (const config of MODERATOR_CONFIGS) {
    parts.push(buildModeratorPromptSyncSQL(config))
  }

  return parts.join('\n')
}
