import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
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

    const { rows: classifierRows } = await write<{
      id: string
      activated_at: Date | null
      deactivated_at: Date | null
    }>(sql`SELECT id, activated_at, deactivated_at FROM classifiers WHERE slug = 'tagging'`)
    expect(classifierRows).toHaveLength(1)
    expect(classifierRows[0]!.activated_at).not.toBeNull()
    expect(classifierRows[0]!.deactivated_at).toBeNull()

    const { rows: promptRows } = await write<{ id: string; model_name: string }>(sql`
      SELECT id, model_name FROM classifier_prompt_versions
      WHERE classifier_id = ${classifierRows[0]!.id}
        AND activated_at IS NOT NULL AND deactivated_at IS NULL
    `)
    expect(promptRows).toHaveLength(1)
    expect(promptRows[0]!.model_name).toBe('typesafe/jev-1.13')

    const { rows: userRows } = await write<{ is_system: boolean }>(sql`
      SELECT is_system FROM users WHERE username = 'autotagger-classifier'
    `)
    expect(userRows).toHaveLength(1)
    expect(userRows[0]!.is_system).toBe(true)

    const { rows: agentRows } = await write<{ id: string }>(sql`
      SELECT a.id FROM agents a
      JOIN users u ON u.id = a.system_user_id
      WHERE u.username = 'autotagger-classifier'
    `)
    expect(agentRows).toHaveLength(0)
  })
})
