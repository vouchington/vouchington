import { describe, expect, it } from 'vitest'
import generateSeedAgentsSQL from '../0010-00-01-seed-agents.mts'
import generateSeedCategorizerSQL from '../0010-00-03-seed-categorizer.mts'
import { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'

describe('0010-00-01-seed-agents idempotent', () => {
  it('generates SQL with system user upsert', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain("'system'")
    expect(sql).toContain('vote_weight_admin_set_at')
  })

  it('reclaims agent system usernames from non-system squatters before upserting', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('platform_account_kind IS NULL')
    expect(sql).toContain("reclaimed-' || replace(id::text, '-', '')")
    expect(sql).toContain("platform_account_kind = 'system'")
  })

  it('generates SQL for all agent system users', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain("'autotagger'")
    expect(sql).toContain("'story-teller'")
    expect(sql).toContain("'voucha'")
    expect(sql).toContain("'click-bait'")
    expect(sql).toContain("'vague-post'")
    expect(sql).toContain("'shit-post'")
    for (const config of MODERATOR_CONFIGS) {
      expect(sql).toContain(`'${config.slug}'`)
    }
  })

  it('documents that agent bootstrap is part of db:migrate config-driven', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('during db:migrate')
  })

  it('seeds baseline flags using the canonical agents__moderators schema', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).not.toContain('ALTER TABLE agents__moderators')
    expect(sql).toContain('INSERT INTO agents__moderators (agent_id, slug, is_baseline)')
  })

  it('guards moderator agent inserts before conflict checks', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('INSERT INTO agents')
    expect(sql).toContain("'moderator'")
    expect(sql).toContain('ON CONFLICT (system_user_id) DO NOTHING')
    expect(sql).toContain(
      'AND NOT EXISTS (SELECT 1 FROM agents existing WHERE existing.system_user_id = u.id)',
    )
    expect(sql).toContain('UPDATE agents a SET agent_type')
    expect(sql).toContain('a.agent_type IS DISTINCT FROM')
  })

  it('generates autotagger agent row', () => {
    const sql = generateSeedAgentsSQL()
    // The autotagger agent INSERT selects by username to get the system_user_id
    expect(sql).toContain("WHERE u.username = 'autotagger'")
    // The agent_type value is inline in the SELECT
    expect(sql).toContain("'autotagger'")
  })

  it('generates storyteller agent row for story-teller', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain("WHERE u.username = 'story-teller'")
    expect(sql).toContain("'storyteller'")
  })

  it('does not recreate the retired Wikipedia recommender identity or agent type', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).not.toContain('wikipedia-recommender')
    expect(sql).not.toContain("'recommender',")
  })

  it('generates agents__moderators rows with slug upsert', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('INSERT INTO agents__moderators')
    expect(sql).toContain('ON CONFLICT (agent_id)')
    expect(sql).toContain('slug = EXCLUDED.slug')
  })

  it('seeds no per-moderator prompt rows, provider, model or flag action', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).not.toContain('agent_prompts')
    expect(sql).not.toContain('openai')
    expect(sql).not.toContain('gpt-5.4-nano')
    expect(sql).not.toContain('on_flag_action')
    expect(sql).not.toContain('review_queue')
  })

  it('seeds each RSS category-source user with vote_weight = 0.01', () => {
    const sql = generateSeedCategorizerSQL()
    expect(sql).toContain("'rss-feed-categorizer'")
    expect(sql).toContain("'rss-feed-collaborative-categorizer'")
    // Routes through buildSystemUserUpsertSQL: reclaim any squatter, then upsert with platform_account_kind.
    expect(sql).toContain('platform_account_kind IS NULL')
    expect(sql).toContain("platform_account_kind = 'system'")
    // Follow-up statement pins the literal 0.01 weight (not the default-weight 1 used by
    // AGENT_SYSTEM_USERS loop), scoped to the system row only.
    expect(sql).toContain('SET vote_weight = 0.01')
    expect(sql).toContain(
      "WHERE username = 'rss-feed-categorizer' AND platform_account_kind = 'system'",
    )
    expect(sql).toContain(
      "WHERE username = 'rss-feed-collaborative-categorizer' AND platform_account_kind = 'system'",
    )
  })

  it('seeds is_baseline true only for ai-generated', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('is_baseline')
    expect(sql).not.toContain('ADD COLUMN')
    expect(sql).toContain('is_baseline = EXCLUDED.is_baseline')

    // exactly ai-generated config has baseline true
    const aiGeneratedConfig = MODERATOR_CONFIGS.find(c => c.slug === 'ai-generated')
    expect(aiGeneratedConfig?.baseline).toBe(true)
    expect(MODERATOR_CONFIGS.filter(c => c.slug !== 'ai-generated').every(c => !c.baseline)).toBe(
      true,
    )

    // ai-generated SQL block uses `true`; all others use `false`
    const sections = sql.split('INSERT INTO agents__moderators').slice(1)
    const aiSection = sections.find(s => s.includes("'ai-generated'"))
    const nonAiSections = sections.filter(s => !s.includes("'ai-generated'"))
    expect(aiSection).toContain('\n  true\n')
    expect(nonAiSections.every(s => s.includes('\n  false\n'))).toBe(true)
  })
})
