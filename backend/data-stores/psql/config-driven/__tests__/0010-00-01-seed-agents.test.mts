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
    expect(sql).toContain('is_system = FALSE')
    expect(sql).toContain("reclaimed-' || replace(id::text, '-', '')")
    expect(sql).toContain('is_system = TRUE')
  })

  it('generates SQL for all agent system users', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain("'autotagger'")
    expect(sql).toContain("'customer-support'")
    expect(sql).toContain("'story-teller'")
    expect(sql).toContain("'wikipedia-recommender'")
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

  it('repairs older agents__moderators schemas before seeding baseline flags', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('ALTER TABLE agents__moderators')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_baseline boolean NOT NULL DEFAULT FALSE')
    expect(sql.indexOf('ADD COLUMN IF NOT EXISTS is_baseline')).toBeLessThan(
      sql.indexOf('INSERT INTO agents__moderators'),
    )
  })

  it('generates moderator agent rows with ON CONFLICT', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('INSERT INTO agents')
    expect(sql).toContain("'moderator'")
    expect(sql).toContain('ON CONFLICT (system_user_id)')
  })

  it('generates autotagger agent row', () => {
    const sql = generateSeedAgentsSQL()
    // The autotagger agent INSERT selects by username to get the system_user_id
    expect(sql).toContain("WHERE u.username = 'autotagger'")
    // The agent_type value is inline in the SELECT
    expect(sql).toContain("'autotagger',")
  })

  it('generates storyteller agent row for story-teller', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain("WHERE u.username = 'story-teller'")
    expect(sql).toContain("'storyteller',")
  })

  it('generates recommender agent row for wikipedia-recommender', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain("WHERE u.username = 'wikipedia-recommender'")
    expect(sql).toContain("'recommender',")
  })

  it('generates agents__moderators rows with slug upsert', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('INSERT INTO agents__moderators')
    expect(sql).toContain('ON CONFLICT (agent_id)')
    expect(sql).toContain('slug = EXCLUDED.slug')
  })

  it('generates prompt management SQL for each moderator', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('INSERT INTO agent_prompts')
    expect(sql).toContain('UPDATE agent_prompts')
    expect(sql).toContain('deactivated_at = CURRENT_TIMESTAMP')
    expect(sql).toContain('MD5(prompt)')
  })

  it('grants only the customer_support role to the system-owned customer support agent', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('INSERT INTO user_roles')
    expect(sql).toContain("urt.slug = 'customer_support'")
    expect(sql).toContain("u.username = 'customer-support' AND u.is_system = TRUE")
    expect(sql).not.toContain("urt.slug = 'administrator'")
    expect(sql).not.toContain('administrator')
  })

  it('uses dollar-quoting for prompt text', () => {
    const sql = generateSeedAgentsSQL()
    // dollarQuote() picks the first candidate tag not present in the prompt text.
    // Assert any valid dollar-quote tag is used rather than pinning to '$prompt$'.
    const hasDollarQuoting = ['$prompt$', '$agent$', '$mod$', '$p$'].some(tag => sql.includes(tag))
    expect(hasDollarQuoting).toBe(true)
  })

  it('seeds each RSS category-source user with vote_weight = 0.01', () => {
    const sql = generateSeedCategorizerSQL()
    expect(sql).toContain("'rss-feed-categorizer'")
    expect(sql).toContain("'rss-feed-collaborative-categorizer'")
    // Routes through buildSystemUserUpsertSQL: reclaim any squatter, then upsert with is_system.
    expect(sql).toContain('is_system = FALSE')
    expect(sql).toContain('is_system = TRUE')
    // Follow-up statement pins the literal 0.01 weight (not the default-weight 1 used by
    // AGENT_SYSTEM_USERS loop), scoped to the system row only.
    expect(sql).toContain('SET vote_weight = 0.01')
    expect(sql).toContain("WHERE username = 'rss-feed-categorizer' AND is_system = TRUE")
    expect(sql).toContain(
      "WHERE username = 'rss-feed-collaborative-categorizer' AND is_system = TRUE",
    )
  })

  it('includes on_flag_action from config', () => {
    const sql = generateSeedAgentsSQL()
    for (const config of MODERATOR_CONFIGS) {
      expect(sql).toContain(config.onFlagAction)
    }
  })

  it('seeds is_baseline true only for ai-generated', () => {
    const sql = generateSeedAgentsSQL()
    expect(sql).toContain('is_baseline')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_baseline')
    expect(sql).toContain('COMMENT ON COLUMN agents__moderators.is_baseline')
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
