import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { buildContextFromTrackedFiles } from 'vouchington-tooling/shared-context'
import { checkRepoFilePolicy } from './index.mts'
import { emptySchemaSnapshot } from './schema-snapshot-test-fixtures.mts'
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
  it('rejects removal of both reference files in the canonical repository context', async () => {
    const root = await makeRepo()
    const snapshot = 'backend/data-stores/psql/schema-snapshot/schema.json'
    await track(root, snapshot, JSON.stringify(emptySchemaSnapshot()))
    execFileSync('git', ['init', '--quiet', '--initial-branch=fixture-branch'], {
      cwd: root,
      timeout: 5_000,
    })
    execFileSync('git', ['add', '.'], { cwd: root, timeout: 5_000 })
    const files = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5_000,
    })
      .split('\0')
      .filter(Boolean)
    const report = await checkRepoFilePolicy(buildContextFromTrackedFiles(root, files))
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Cannot read tracked web/test-helpers/form-keyboard.ts'),
      ]),
    )
  })
})
