import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkEmailCopyRegistry } from './check-email-copy-registry.mts'
import { checkWorkflowTestActionRefs } from './check-workflow-test-action-refs.mts'

describe('repository source policy readers', () => {
  it('reads nested action and workflow fixtures without scanning the checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-source-policy-'))
    try {
      mkdirSync(join(root, '.github/actions/example/nested'), { recursive: true })
      mkdirSync(join(root, '.github/workflows/nested'), { recursive: true })
      writeFileSync(
        join(root, '.github/actions/example/nested/shape.test.mts'),
        'expect(ref).toMatch(/@v\\d+/)',
      )
      writeFileSync(join(root, '.github/workflows/nested/notes.md'), 'not a workflow test')
      expect(checkWorkflowTestActionRefs(root)).toEqual([])

      const firstVersion = ['v', '1'].join('')
      const secondVersion = ['v', '2'].join('')
      writeFileSync(
        join(root, '.github/actions/example/nested/pin.test.mts'),
        `expect(ref).toBe('actions/example@${firstVersion}')`,
      )
      writeFileSync(
        join(root, '.github/workflows/nested/pin.test.mts'),
        `expect(ref).toContain('uses: actions/example@${secondVersion}')`,
      )
      expect(checkWorkflowTestActionRefs(root).map(violation => violation.split(':')[0])).toEqual([
        '.github/actions/example/nested/pin.test.mts',
        '.github/workflows/nested/pin.test.mts',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('checks email fixture sources and rejects the two replaced paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'email-source-policy-'))
    try {
      mkdirSync(join(root, 'email-templates/nested'), { recursive: true })
      writeFileSync(join(root, 'email-templates/catalog-copy.mts'), "locale === 'en'")
      writeFileSync(
        join(root, 'email-templates/nested/copy.test.mts'),
        'const exampleByLocale = {}',
      )
      writeFileSync(join(root, 'email-templates/nested/notes.md'), 'ByLocale')
      expect(checkEmailCopyRegistry(root)).toEqual([])

      writeFileSync(join(root, 'email-templates/nested/residual.tsx'), 'const copyByLocale = {}')
      mkdirSync(join(root, 'ts-shared/ui-messages/messages'), { recursive: true })
      mkdirSync(join(root, 'dev/localization'), { recursive: true })
      writeFileSync(join(root, 'dev/localization/import.mts'), '')
      expect(checkEmailCopyRegistry(root)).toEqual([
        'nested/residual.tsx: residual email product copy',
        'ts-shared/ui-messages/messages: replaced copy path exists',
        'dev/localization/import.mts: replaced copy path exists',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
