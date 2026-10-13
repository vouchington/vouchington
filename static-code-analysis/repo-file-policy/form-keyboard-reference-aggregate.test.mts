import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { setupRepoFilePolicyTest } from '../test-helpers/repo-file-policy-fixtures.mts'

const DOCUMENT = 'docs/requirements/navigation/reference-components-patterns.md'
const HELPER = 'web/test-helpers/form-keyboard.ts'
const REFERENCE = `Spec: ${DOCUMENT}#form-keyboard-behavior`

describe('form keyboard reference aggregate routing', () => {
  const { makeRepo, track, run } = setupRepoFilePolicyTest()

  it('keeps unrelated finite aggregate fixtures valid without a Git index', async () => {
    const root = await makeRepo()
    await expect(run(root)).resolves.toEqual({ stdout: 'All checks passed.' })
  })

  it('rejects a stale indexed reference through the canonical aggregate', async () => {
    const root = await makeRepo()
    await track(root, HELPER, `// ${REFERENCE}\n`)
    await track(root, DOCUMENT, '### Form Keyboard Behavior\n')
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, timeout: 5_000 })
    git('init', '--quiet', '--initial-branch=fixture-branch')
    git('add', '.')
    await expect(run(root)).resolves.toEqual({ stdout: 'All checks passed.' })
    await track(
      root,
      'docs/obsolete.md',
      ['docs/requirements/navigation/', 'COMPONENTS.md#form-keyboard-behavior'].join(''),
    )
    git('add', 'docs/obsolete.md')
    await track(root, 'docs/obsolete.md', REFERENCE)
    await expect(run(root)).rejects.toMatchObject({
      stdout: expect.stringContaining('Obsolete reference remains in tracked blobs'),
    })
  })
})
