import { describe, expect, it } from 'vitest'
import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
import {
  getLocalClassifierBySlug,
  listLocalActiveClassifierPromptVersions,
} from '../../../../test-helpers/data-stores/psql/classifiers-seed.mts'
import { getLocalTestUserRawByUsername } from '../../../../test-helpers/data-stores/psql/users.mts'
import generateSeedAutotaggerAgentClassifierSQL from '../0635-00-06-seed-autotagger-agent-classifier.mts'

describe('0635-00-06-seed-autotagger-agent-classifier SQL shape', () => {
  it('reclaims and upserts the reserved autotagger system user', () => {
    const generated = generateSeedAutotaggerAgentClassifierSQL()
    expect(generated).toContain("'autotagger'")
    expect(generated).toContain('platform_account_kind IS NULL')
    expect(generated).toContain("platform_account_kind = 'system'")
  })

  it('inserts a topic-kind Noul classifier without ever updating it', () => {
    const generated = generateSeedAutotaggerAgentClassifierSQL()
    expect(generated).toContain("'autotagger-agent', 'noul', 'topic'")
    expect(generated).toContain('ON CONFLICT (slug) DO NOTHING')
    expect(generated).not.toContain('UPDATE classifiers')
    expect(generated).not.toContain('INSERT INTO agents')
  })

  it('dollar-quotes the prompt with exactly one candidate placeholder', () => {
    const generated = generateSeedAutotaggerAgentClassifierSQL()
    expect(generated).toContain('$autotagger_agent_prompt$')
    // The one-placeholder prompt is interpolated into the rotation check, the insert and the guard.
    expect(generated.split('{{candidate}}')).toHaveLength(4)
    expect(generated).toContain('MD5(prompt) != MD5(')
    expect(generated).not.toContain('activated_at = NULL')
  })

  it('asks for a higher confidence than the first stage', () => {
    expect(generateSeedAutotaggerAgentClassifierSQL()).toContain('0.2500, 0.7500')
  })
})

describe('0635-00-06-seed-autotagger-agent-classifier (real DB)', () => {
  it('reaches a stable single active classifier and prompt version across reruns', async () => {
    const generated = generateSeedAutotaggerAgentClassifierSQL()
    await runConfigDrivenStatementsInTransaction(generated, undefined)
    await runConfigDrivenStatementsInTransaction(generated, undefined)

    const classifier = await getLocalClassifierBySlug('autotagger-agent')
    expect(classifier).not.toBeNull()
    expect(classifier!.activated_at).not.toBeNull()
    expect(classifier!.deactivated_at).toBeNull()

    const promptRows = await listLocalActiveClassifierPromptVersions(classifier!.id)
    expect(promptRows).toHaveLength(1)
    expect(promptRows[0]!.model_name).toBe('typesafe/jev-1.13')

    const user = await getLocalTestUserRawByUsername('autotagger')
    expect(user).not.toBeNull()
    expect(user!.platform_account_kind).toBe('system')
  })
})
