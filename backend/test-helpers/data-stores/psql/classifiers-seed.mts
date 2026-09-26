import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Package-local substitute for @voucha/test-helpers' classifier fixtures (same workspace-cycle
// rationale as users.mts above): @data-stores/psql's own config-driven migration tests cannot
// depend on @services/classifiers or @voucha/test-helpers, so this reads the seeded
// classifiers/classifier_prompt_versions/agents state directly. Uses `write` (the primary pool),
// not `read`, so a SELECT immediately following runConfigDrivenStatementsInTransaction in the same
// test never races replica replay lag -- mirrors getActiveClassifierConfigurationBySlugFromPrimary
// (backend/services/classifiers/get-active-classifier-configuration.mts), which cannot be imported
// here for the same cycle reason. Do not export this outside @data-stores/psql -- use
// @voucha/test-helpers/data-stores/psql/classifiers (createClassifierFixture) in every other
// package.

export async function getLocalClassifierBySlug(slug: string): Promise<{
  id: string
  primitive: string
  candidate_kind: string
  activated_at: Date | null
  deactivated_at: Date | null
} | null> {
  const { rows } = await write<{
    id: string
    primitive: string
    candidate_kind: string
    activated_at: Date | null
    deactivated_at: Date | null
  }>(sql`
    SELECT id, primitive, candidate_kind, activated_at, deactivated_at
    FROM classifiers WHERE slug = ${slug}
  `)
  return rows[0] ?? null
}

export async function listLocalActiveClassifierPromptVersions(
  classifierId: string,
): Promise<{ id: string; model_name: string; model_provider: string }[]> {
  const { rows } = await write<{ id: string; model_name: string; model_provider: string }>(sql`
    SELECT id, model_name, model_provider FROM classifier_prompt_versions
    WHERE classifier_id = ${classifierId}
      AND activated_at IS NOT NULL AND deactivated_at IS NULL
  `)
  return rows
}

// Proves a system-user reclaim generator did NOT also grant the reclaimed user an agents row --
// used by seed generators (like 0635-00-02-seed-tagging-classifier) that intentionally seed only a
// system user, not an agent.
export async function countLocalAgentsForSystemUsername(username: string): Promise<number> {
  const { rows } = await write<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM agents a
    JOIN users u ON u.id = a.system_user_id
    WHERE u.username = ${username}
  `)
  return rows[0]?.count ?? 0
}
