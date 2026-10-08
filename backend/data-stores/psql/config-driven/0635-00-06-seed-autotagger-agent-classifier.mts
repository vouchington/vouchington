import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import { AUTOTAGGER_AGENT_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { buildSystemUserUpsertSQL } from './utils/system-user-seed.mts'

/**
 * Seeds the global `autotagger-agent` classifier row for the scoped reasoning autotagger (C7). It
 * is an agent, not a jev classifier: it has no prompt version, no model and no thresholds. Its
 * instructions live in code, its provider and model come from the `autotagger-agent` entry of the
 * `ai-model-routing` setting, and its answer is a set of facts (topic ids from the run's captured
 * candidates), so nothing here can score a candidate. The row exists to own the run receipts, the
 * request queue and the ledger attribution that every classifier shares.
 *
 * Its actor is the reserved `autotagger` system account (upserted by the agent seed too, so the
 * reclaim-then-upsert here is only an ordering guard), recorded as the classifier's created_by_id.
 * Spend is attributed to the `autotagger-agent` workload, never to C6's `autotagger`.
 *
 * The row is inserted pre-activated (ON CONFLICT DO NOTHING is a plain INSERT, so the
 * activation-lifecycle trigger, which only fires on UPDATE, never runs here).
 *
 * @public loaded by path by the config-driven migration runner
 */
export default function generateSeedAutotaggerAgentClassifierSQL(): string {
  return `${buildSystemUserUpsertSQL(AUTOTAGGER_AGENT_SYSTEM_USERNAME)}

INSERT INTO classifiers (slug, primitive, candidate_kind, activated_at, created_by_id)
SELECT '${AUTOTAGGER_AGENT_SLUG}', 'agent', 'topic', CURRENT_TIMESTAMP, u.id
FROM users u
WHERE u.username = '${AUTOTAGGER_AGENT_SYSTEM_USERNAME}' AND u.platform_account_kind = 'system'
ON CONFLICT (slug) DO NOTHING;`
}
