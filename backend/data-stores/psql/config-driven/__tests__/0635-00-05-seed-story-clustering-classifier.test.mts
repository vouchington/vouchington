import { describe, expect, it } from 'vitest'
import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
import {
  getLocalClassifierBySlug,
  listLocalActiveClassifierPromptVersions,
  countLocalAgentsForSystemUsername,
} from '../../../../test-helpers/data-stores/psql/classifiers-seed.mts'
import { getLocalTestUserRawByUsername } from '../../../../test-helpers/data-stores/psql/users.mts'
import generateSeedStoryClusteringClassifierSQL from '../0635-00-05-seed-story-clustering-classifier.mts'

describe('0635-00-05-seed-story-clustering-classifier SQL shape', () => {
  it('reclaims and upserts the story-clustering-classifier system user', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).toContain("'story-clustering-classifier'")
    expect(generated).toContain('platform_account_kind IS NULL')
    expect(generated).toContain("platform_account_kind = 'system'")
  })

  it('inserts a story-kind Choice classifier without ever updating it', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).toContain("'story-clustering-classifier', 'choice', 'story'")
    expect(generated).toContain('ON CONFLICT (slug) DO NOTHING')
    expect(generated).not.toContain('UPDATE classifiers')
    expect(generated).not.toContain('INSERT INTO agents')
  })

  it('dollar-quotes the prompt and rotates only on content change', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).toContain('$story_clustering_prompt$')
    expect(generated).toContain('MD5(prompt) != MD5(')
    expect(generated).toContain('deactivated_at = CURRENT_TIMESTAMP')
    expect(generated).not.toContain('activated_at = NULL')
  })

  it('keeps the lower threshold above one half so two choices cannot both clear it', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).toContain('0.6500, 0.9500')
  })
})

describe('0635-00-05-seed-story-clustering-classifier (real DB)', () => {
  it('reaches a stable single active classifier and prompt version across reruns', async () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    await runConfigDrivenStatementsInTransaction(generated, undefined)
    await runConfigDrivenStatementsInTransaction(generated, undefined)

    const classifier = await getLocalClassifierBySlug('story-clustering-classifier')
    expect(classifier).not.toBeNull()
    expect(classifier!.activated_at).not.toBeNull()
    expect(classifier!.deactivated_at).toBeNull()

    const promptRows = await listLocalActiveClassifierPromptVersions(classifier!.id)
    expect(promptRows).toHaveLength(1)
    expect(promptRows[0]!.model_name).toBe('typesafe/jev-1.13')

    const user = await getLocalTestUserRawByUsername('story-clustering-classifier')
    expect(user).not.toBeNull()
    expect(user!.platform_account_kind).toBe('system')
    expect(await countLocalAgentsForSystemUsername('story-clustering-classifier')).toBe(1)
  })
})
