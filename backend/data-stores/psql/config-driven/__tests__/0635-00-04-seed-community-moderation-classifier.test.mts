import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import { MODERATION_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { describe, expect, it } from 'vitest'
import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
import { getLocalClassifierSeedFacts } from '../../../../test-helpers/data-stores/psql/classifiers-seed.mts'
import generateSeedCommunityModerationClassifierSQL from '../0635-00-04-seed-community-moderation-classifier.mts'

const generated = generateSeedCommunityModerationClassifierSQL()

describe('0635-00-04-seed-community-moderation-classifier SQL shape', () => {
  it('inserts a pre-activated community_prompt classifier without ever updating it', () => {
    expect(generated).toContain('INSERT INTO classifiers')
    expect(generated).toContain(
      `'${COMMUNITY_MODERATION_CLASSIFIER_SLUG}', 'noul', 'community_prompt'`,
    )
    expect(generated).toContain('ON CONFLICT (slug) DO NOTHING')
    expect(generated).not.toContain('UPDATE classifiers')
  })

  it('requires the existing automod system user instead of minting one', () => {
    expect(generated).toContain(`username = '${MODERATION_SYSTEM_USERNAME}'`)
    expect(generated).toContain('RAISE EXCEPTION')
    expect(generated).not.toContain('INSERT INTO users')
    expect(generated).not.toContain('INSERT INTO agents')
  })

  it('seeds no stored candidates or thresholds: each community prompt is its own candidate', () => {
    expect(generated).not.toContain('INSERT INTO classifier_candidates')
    expect(generated).not.toContain('INSERT INTO classifier_candidate_thresholds')
  })

  it('dollar-quotes one prompt with exactly one candidate placeholder and rotates on change', () => {
    const quoted = generated.split('$community_moderation_prompt$')
    expect(quoted).toHaveLength(5)
    expect(quoted[1]!.split('{{candidate}}')).toHaveLength(2)
    expect(generated).toContain('MD5(prompt) != MD5(')
    expect(generated).toContain('deactivated_at = CURRENT_TIMESTAMP')
    expect(generated).not.toContain('activated_at = NULL')
  })
})

describe('0635-00-04-seed-community-moderation-classifier (real DB)', () => {
  it('converges to one active classifier and prompt version across reruns', async () => {
    await runConfigDrivenStatementsInTransaction(generated, undefined)
    const first = await getLocalClassifierSeedFacts(COMMUNITY_MODERATION_CLASSIFIER_SLUG)
    await runConfigDrivenStatementsInTransaction(generated, undefined)
    const second = await getLocalClassifierSeedFacts(COMMUNITY_MODERATION_CLASSIFIER_SLUG)

    expect(second).toEqual(first)
    expect(second).toMatchObject({
      candidate_kind: 'community_prompt',
      stored_candidates: 0,
      active_prompts: 1,
      model_provider: 'openrouter',
      default_lower_threshold: '0.2500',
      default_upper_threshold: '0.7500',
      created_by_username: MODERATION_SYSTEM_USERNAME,
    })
    expect(second.prompt!.split('{{candidate}}')).toHaveLength(2)
  })
})
