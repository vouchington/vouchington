import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { writeFakeGh, writeFakeGit } from '../../test-helpers/pr-description/fake-cli.mts'
import { VALID_PR_BODY } from '../../test-helpers/pr-description/valid-pr-body.mts'

describe('PR content policy at the CLI boundary', () => {
  const dirs: string[] = []
  const script = fileURLToPath(new URL('../../pr-description.mts', import.meta.url))

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it.each(['create', 'update', 'validate'])('rejects hidden Impact through %s', async command => {
    const dir = await mkdtemp(join(tmpdir(), 'pr-content-policy-'))
    dirs.push(dir)
    const bin = join(dir, 'bin')
    const callsPath = join(dir, 'calls.jsonl')
    const bodyPath = join(dir, 'body.md')
    const body = `${VALID_PR_BODY.replace('## Impact', '## Supplemental impact')}\n<details>\n<summary>Evidence</summary>\n\n## Impact\n\nHidden claim.\n\n</details>\n`
    await mkdir(bin)
    await writeFile(bodyPath, body)
    await writeFile(callsPath, '')
    await writeFakeGit(join(bin, 'git'))
    await writeFakeGh(
      join(bin, 'gh'),
      "if (args[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo' }))",
      `else if (args[0] === 'pr' && args[1] === 'view') console.log(JSON.stringify({ body: ${JSON.stringify(body)}, number: 1, state: "OPEN", url: "https://github.com/owner/repo/pull/1", baseRefOid: "${'a'.repeat(40)}", headRefOid: "${'b'.repeat(40)}" }))`,
      "else if (args[0] === 'api') console.log(JSON.stringify({ number: 123, state: 'open', title: 'Description quality' }))",
      "else if (args[0] === 'issue') console.log('[]')",
    )
    const args =
      command === 'create'
        ? ['create', '--title', 'Explain impact', '--body-file', bodyPath]
        : command === 'update'
          ? ['update', '1', '--body-file', bodyPath]
          : ['validate', '1']
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GH_CALLS_PATH: callsPath, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Impact')
    const calls = (await readFile(callsPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as string[])
    expect(calls.some(call => call[0] === 'pr' && ['create', 'edit'].includes(call[1] ?? ''))).toBe(
      false,
    )
  })
})
