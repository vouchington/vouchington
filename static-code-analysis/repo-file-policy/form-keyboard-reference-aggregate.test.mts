import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildContextFromTrackedFiles } from 'vouchington-tooling/shared-context'
import { checkRepoFilePolicy } from './index.mts'
import { emptySchemaSnapshot } from './schema-snapshot-test-fixtures.mts'
import { setupRepoFilePolicyTest } from '../test-helpers/repo-file-policy-fixtures.mts'

let deadline = 0n

function remaining(): number {
  const milliseconds = Number((deadline - process.hrtime.bigint()) / 1_000_000n)
  if (milliseconds <= 0) throw new Error('Fixture Git deadline exhausted')
  return milliseconds
}

const DOCUMENT = 'docs/requirements/navigation/reference-components-patterns.md'
const HELPER = 'web/test-helpers/form-keyboard.ts'
const REFERENCE = `Spec: ${DOCUMENT}#form-keyboard-behavior`

describe('form keyboard reference aggregate routing', () => {
  beforeEach(() => {
    deadline = process.hrtime.bigint() + 4_000_000_000n
  })
  const { makeRepo, track, run } = setupRepoFilePolicyTest()

  it('keeps unrelated finite aggregate fixtures valid without a Git index', async () => {
    const root = await makeRepo()
    await expect(run(root, { formKeyboardDeadline: deadline })).resolves.toEqual({
      stdout: 'All checks passed.',
    })
  })

  it('rejects a stale indexed reference through the canonical aggregate', async () => {
    const root = await makeRepo()
    await track(root, HELPER, `// ${REFERENCE}\n`)
    await track(root, DOCUMENT, '### Form Keyboard Behavior\n')
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, timeout: remaining() })
    git('init', '--quiet', '--initial-branch=fixture-branch')
    git('add', '.')
    await expect(run(root, { formKeyboardDeadline: deadline })).resolves.toEqual({
      stdout: 'All checks passed.',
    })
    await track(
      root,
      'docs/obsolete.md',
      ['docs/requirements/navigation/', 'COMPONENTS.md#form-keyboard-behavior'].join(''),
    )
    git('add', 'docs/obsolete.md')
    await track(root, 'docs/obsolete.md', REFERENCE)
    await expect(run(root, { formKeyboardDeadline: deadline })).rejects.toMatchObject({
      stdout: expect.stringContaining('Obsolete reference remains in tracked blobs'),
    })
  })
  it('rejects removal of both reference files in the canonical repository context', async () => {
    const root = await makeRepo()
    const snapshot = 'backend/data-stores/psql/schema-snapshot/schema.json'
    await track(root, snapshot, JSON.stringify(emptySchemaSnapshot()))
    execFileSync('git', ['init', '--quiet', '--initial-branch=fixture-branch'], {
      cwd: root,
      timeout: remaining(),
    })
    execFileSync('git', ['add', '.'], { cwd: root, timeout: remaining() })
    const files = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      timeout: remaining(),
    })
      .split('\0')
      .filter(Boolean)
    const report = await checkRepoFilePolicy(buildContextFromTrackedFiles(root, files), {
      formKeyboardDeadline: deadline,
    })
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Cannot read tracked web/test-helpers/form-keyboard.ts'),
      ]),
    )
  })
})
