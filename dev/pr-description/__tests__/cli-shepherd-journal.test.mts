import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { VALID_PROVENANCE_BLOCK } from '../../test-helpers/pr-description/valid-pr-body.mts'

describe('dev/pr-description.mts canonical Shepherd Journal update', () => {
  const execFileAsync = promisify(execFile)
  const scriptPath = fileURLToPath(new URL('../../pr-description.mts', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('splices the exact live details journal into an update that omits it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-details-cli-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'calls')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(
      bodyPath,
      `## Summary\n\nUpdated.\n\n## Related issues\n\nCloses #7391\n\nWorkspace setup: not needed\n${VALID_PROVENANCE_BLOCK}\n`,
    )
    const journal = '<details>\n<summary>Shepherd Journal</summary>\n\n- Preserved.\n</details>'
    const ghPath = join(binDir, 'gh')
    await writeFile(
      ghPath,
      [
        '#!/usr/bin/env node',
        "import { appendFileSync, readFileSync } from 'node:fs'",
        'const args = process.argv.slice(2)',
        "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
        "else if (args[0] === 'api') console.log(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7391', number: 7391, state: 'open', title: 'test' }))",
        "else if (args[0] === 'issue') console.log('[]')",
        `else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: ${JSON.stringify(`## Summary\n\nOld.\n\n${journal}`)} }))`,
        "else if (args[0] === 'pr' && args[1] === 'edit') { const i = args.indexOf('--body-file'); appendFileSync(process.env.GH_CALLS_PATH, readFileSync(args[i + 1], 'utf8')) }",
      ].join('\n'),
    )
    await chmod(ghPath, 0o755)
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }

    await expect(
      execFileAsync(process.execPath, [scriptPath, 'update', '9', '--body-file', bodyPath], {
        env,
      }),
    ).resolves.toMatchObject({ stdout: expect.stringContaining('PR description updated.') })
    expect(await readFile(callsPath, 'utf8')).toContain(journal)
  })
})
