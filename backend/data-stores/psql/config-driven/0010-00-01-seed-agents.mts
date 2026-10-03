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

  parts.push(buildSystemUserUpsertSQL('voucha', 'official'))

  // Classifier actors are AI accounts, independently of activation.
  for (const username of [
    'post-classifier',
    'autotagger-classifier',
    'story-clustering-classifier',
    'rss-feed-categorizer',
    'rss-feed-collaborative-categorizer',
    'automod',
  ]) {
    parts.push(buildSystemUserUpsertSQL(username))
    parts.push(buildAgentSeedSQL(username, 'classifier', false))
  }

  for (const config of MODERATOR_CONFIGS) {
    parts.push(buildAgentSeedSQL(config.slug, 'moderator', true))
  }
  parts.push(buildAgentSeedSQL('autotagger', 'autotagger', true))
  parts.push(buildAgentSeedSQL('story-teller', 'storyteller', true))

  // Upsert agents__moderators rows. The C5 classifiers are record-only (the community action is
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

function buildAgentSeedSQL(username: string, agentType: string, activate: boolean): string {
  const activation = activate ? ', activated_at' : ''
  const activationValue = activate ? ', CURRENT_TIMESTAMP' : ''
  const lifecycleUpdates = activate
    ? ', activated_at = COALESCE(a.activated_at, CURRENT_TIMESTAMP), deactivated_at = NULL'
    : ''
  const lifecycleChanges = activate
    ? ' OR a.activated_at IS NULL OR a.deactivated_at IS NOT NULL'
    : ''
  return `
INSERT INTO agents (system_user_id, agent_type, created_by_id${activation})
SELECT u.id, '${agentType}', (SELECT id FROM users WHERE username = 'system')${activationValue}
FROM users u
WHERE u.username = '${username}' AND u.platform_account_kind = 'system'
  AND NOT EXISTS (SELECT 1 FROM agents existing WHERE existing.system_user_id = u.id)
ON CONFLICT (system_user_id) DO NOTHING;

UPDATE agents a SET agent_type = '${agentType}', deleted_at = NULL${lifecycleUpdates}
FROM users u
WHERE a.system_user_id = u.id AND u.username = '${username}' AND u.platform_account_kind = 'system'
  AND (a.agent_type IS DISTINCT FROM '${agentType}' OR a.deleted_at IS NOT NULL${lifecycleChanges});`
}
