import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const script = fileURLToPath(new URL('../../pr-description.mts', import.meta.url))
const body = `## Related issues

No source issue; direct user request.
<!-- related-issues-validation: no-source-direct-request -->

Workspace setup: ./dev/initialize monorepo
`

async function runCli(context: { CI: string; GITHUB_ACTIONS: string }) {
  const dir = await mkdtemp(join(tmpdir(), 'pr-description-direct-request-'))
  try {
    const path = join(dir, 'body.md')
    await writeFile(path, body)
    return await execFileAsync(process.execPath, [script, 'validate', '--body-file', path], {
      env: { ...process.env, CI: context.CI, GITHUB_ACTIONS: context.GITHUB_ACTIONS },
    })
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
}

describe('direct-user-request CLI runtime context', () => {
  it('accepts the representation from an interactive runtime', async () => {
    expect((await runCli({ CI: 'false', GITHUB_ACTIONS: 'false' })).stdout).toContain(
      'PR body is valid.',
    )
  })

  it.each([
    { CI: 'true', GITHUB_ACTIONS: 'false' },
    { CI: 'false', GITHUB_ACTIONS: 'true' },
  ])('rejects automation with CI=$CI and GITHUB_ACTIONS=$GITHUB_ACTIONS', async context => {
    await expect(runCli(context)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('interactive'),
    })
  })
})
