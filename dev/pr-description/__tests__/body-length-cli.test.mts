import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { GITHUB_BODY_MAX_CHARACTERS, validateGitHubBodyLength } from 'vouchington-tooling/gh-cli'
import { afterEach, describe, expect, it } from 'vitest'

import { writeFakeGh } from '../test-helpers/fake-cli.mts'
import { VALID_PR_BODY } from '../test-helpers/valid-pr-body.mts'

function oversizedBody(): string {
  const currentLength = validateGitHubBodyLength(VALID_PR_BODY).characterCount
  return `${VALID_PR_BODY}${'x'.repeat(GITHUB_BODY_MAX_CHARACTERS + 1 - currentLength)}`
}

describe('PR description body length CLI', () => {
  const execFileAsync = promisify(execFile)
  const scriptPath = fileURLToPath(new URL('../../pr-description.mts', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it.each([
    ['validate', ['validate', '--body-file']],
    ['create', ['create', '--title', 'Oversized', '--body-file']],
  ])('rejects an oversized %s body before GitHub work', async (_subcommand, command) => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-body-length-create-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(bodyPath, oversizedBody())
    await writeFile(join(binDir, 'gh'), '#!/bin/sh\necho called >> "$GH_CALLS_PATH"\n')
    await chmod(join(binDir, 'gh'), 0o755)
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }

    await expect(
      execFileAsync(process.execPath, [scriptPath, ...command, bodyPath], { env }),
    ).rejects.toMatchObject({ code: 1 })
    await expect(readFile(callsPath, 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('rejects an oversized update body before editing the PR', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-description-body-length-update-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const callsPath = join(dir, 'gh-calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    await mkdir(binDir)
    await writeFile(bodyPath, oversizedBody())
    await writeFakeGh(
      join(binDir, 'gh'),
      "if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: '' }))",
    )
    const env = { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${binDir}:${process.env.PATH}` }

    await expect(
      execFileAsync(process.execPath, [scriptPath, 'update', '1', '--body-file', bodyPath], {
        env,
      }),
    ).rejects.toMatchObject({ code: 1 })
    const calls = (await readFile(callsPath, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as string[])
    expect(calls.some(call => call[0] === 'pr' && call[1] === 'edit')).toBe(false)
  })
})
