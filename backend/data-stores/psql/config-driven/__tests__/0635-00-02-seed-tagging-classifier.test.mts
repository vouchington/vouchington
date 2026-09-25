import { describe, expect, it } from 'vitest'
import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
import {
  getLocalClassifierBySlug,
  listLocalActiveClassifierPromptVersions,
  countLocalAgentsForSystemUsername,
} from '../../../../test-helpers/data-stores/psql/classifiers-seed.mts'
import { getLocalTestUserRawByUsername } from '../../../../test-helpers/data-stores/psql/users.mts'
import generateSeedTaggingClassifierSQL from '../0635-00-02-seed-tagging-classifier.mts'

describe('0635-00-02-seed-tagging-classifier SQL shape', () => {
  it('reclaims and upserts the autotagger-classifier system user', () => {
    const generated = generateSeedTaggingClassifierSQL()
    expect(generated).toContain("'autotagger-classifier'")
    expect(generated).toContain('is_system = FALSE')
    expect(generated).toContain('is_system = TRUE')
  })

  it('inserts the classifier without ever updating it', () => {
    const generated = generateSeedTaggingClassifierSQL()
    expect(generated).toContain('INSERT INTO classifiers')
    expect(generated).toContain("'tagging', 'noul', 'topic'")
    expect(generated).toContain('ON CONFLICT (slug) DO NOTHING')
    expect(generated).not.toContain('UPDATE classifiers')
  })

  it('does not grant the autotagger-classifier user an agents row', () => {
    const generated = generateSeedTaggingClassifierSQL()
    expect(generated).not.toContain('INSERT INTO agents ')
    expect(generated).not.toContain('INSERT INTO agents\n')
  })

  it('dollar-quotes the prompt and rotates only on content change', () => {
    const generated = generateSeedTaggingClassifierSQL()
    expect(generated).toContain('$tagging_prompt$')
    expect(generated).toContain('{{candidate}}')
    expect(generated).toContain('MD5(prompt) != MD5(')
    expect(generated).toContain('deactivated_at = CURRENT_TIMESTAMP')
    expect(generated).not.toContain('activated_at = NULL')
  })
})

describe('0635-00-02-seed-tagging-classifier (real DB)', () => {
  it('reaches a stable single active classifier and prompt version across reruns', async () => {
    const generated = generateSeedTaggingClassifierSQL()
    await runConfigDrivenStatementsInTransaction(generated, undefined)
    await runConfigDrivenStatementsInTransaction(generated, undefined)

    const classifier = await getLocalClassifierBySlug('tagging')
    expect(classifier).not.toBeNull()
    expect(classifier!.activated_at).not.toBeNull()
    expect(classifier!.deactivated_at).toBeNull()

    const promptRows = await listLocalActiveClassifierPromptVersions(classifier!.id)
    expect(promptRows).toHaveLength(1)
    expect(promptRows[0]!.model_name).toBe('typesafe/jev-1.13')

    const user = await getLocalTestUserRawByUsername('autotagger-classifier')
    expect(user).not.toBeNull()
    expect(user!.is_system).toBe(true)

    const agentCount = await countLocalAgentsForSystemUsername('autotagger-classifier')
    expect(agentCount).toBe(0)
  })
})
