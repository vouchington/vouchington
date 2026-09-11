import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { FIXTURE_HEAD_BRANCH, writeFakeGh, writeFakeGit } from '../test-helpers/fake-cli.mts'
import { VALID_PROVENANCE_BLOCK } from '../test-helpers/valid-pr-body.mts'

describe('dev/pr-description.mts create with an unpushed head branch', () => {
  const execFileAsync = promisify(execFile)
  const scriptPath = fileURLToPath(new URL('../../pr-description.mts', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('fails with an actionable message when the head branch is not pushed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-unpushed-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(
      bodyPath,
      `## Summary\n\nSafe CLI parsing.\n\n## Related issues\n\nCloses #7391\n\nWorkspace setup: not needed\n${VALID_PROVENANCE_BLOCK}\n`,
    )
    const ghPath = join(binDir, 'gh')
    await writeFakeGh(
      ghPath,
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      "else if (args[0] === 'api') console.log(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7391', number: 7391, state: 'open', title: 'CLI safety' }))",
      "else if (args[0] === 'issue') console.log('[]')",
    )
    await writeFakeGit(join(binDir, 'git'), { pushed: false })
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }

    await expect(
      execFileAsync(
        process.execPath,
        [scriptPath, 'create', '--title', 'Harden CLI', '--body-file', bodyPath],
        { env },
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        `branch "${FIXTURE_HEAD_BRANCH}" is not on remote "origin" — push it before creating the pull request`,
      ),
    })
  })
})
