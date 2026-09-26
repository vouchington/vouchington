import { describe, expect, it } from 'vitest'
import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
import {
  getLocalClassifierBySlug,
  listLocalActiveClassifierPromptVersions,
  countLocalAgentsForSystemUsername,
} from '../../../../test-helpers/data-stores/psql/classifiers-seed.mts'
import { getLocalTestUserRawByUsername } from '../../../../test-helpers/data-stores/psql/users.mts'
import generateSeedStoryClusteringClassifierSQL from '../0730-00-02-seed-story-clustering-classifier.mts'

describe('0730-00-02-seed-story-clustering-classifier SQL shape', () => {
  it('reclaims and upserts the story-clustering-classifier system user', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).toContain("'story-clustering-classifier'")
    expect(generated).toContain('is_system = FALSE')
    expect(generated).toContain('is_system = TRUE')
  })

  it('inserts the classifier without ever updating it', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).toContain('INSERT INTO classifiers')
    expect(generated).toContain("'story-clustering-classifier', 'choice', 'story'")
    expect(generated).toContain('ON CONFLICT (slug) DO NOTHING')
    expect(generated).not.toContain('UPDATE classifiers')
  })

  it('does not grant the story-clustering-classifier user an agents row', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).not.toContain('INSERT INTO agents ')
    expect(generated).not.toContain('INSERT INTO agents\n')
  })

  it('dollar-quotes the prompt and rotates only on content change', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).toContain('$story_clustering_prompt$')
    expect(generated).toContain('MD5(prompt) != MD5(')
    expect(generated).toContain('deactivated_at = CURRENT_TIMESTAMP')
    expect(generated).not.toContain('activated_at = NULL')
  })

  it('never templates a per-candidate placeholder into the prompt', () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    expect(generated).not.toContain('{{candidate}}')
  })
})

describe('0730-00-02-seed-story-clustering-classifier (real DB)', () => {
  it('reaches a stable single active classifier and prompt version across reruns', async () => {
    const generated = generateSeedStoryClusteringClassifierSQL()
    await runConfigDrivenStatementsInTransaction(generated, undefined)
    await runConfigDrivenStatementsInTransaction(generated, undefined)

    const classifier = await getLocalClassifierBySlug('story-clustering-classifier')
    expect(classifier).not.toBeNull()
    expect(classifier!.activated_at).not.toBeNull()
    expect(classifier!.deactivated_at).toBeNull()
    expect(classifier!.primitive).toBe('choice')
    expect(classifier!.candidate_kind).toBe('story')

    const promptRows = await listLocalActiveClassifierPromptVersions(classifier!.id)
    expect(promptRows).toHaveLength(1)
    expect(promptRows[0]!.model_name).toBe('typesafe/jev-1.13')
    expect(promptRows[0]!.model_provider).toBe('openrouter')

    const user = await getLocalTestUserRawByUsername('story-clustering-classifier')
    expect(user).not.toBeNull()
    expect(user!.is_system).toBe(true)

    const agentCount = await countLocalAgentsForSystemUsername('story-clustering-classifier')
    expect(agentCount).toBe(0)
  })
})
