import { execFile as execFileCallback } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const roots: string[] = []
const head = 'a'.repeat(40)

async function fixture(): Promise<{ root: string; env: NodeJS.ProcessEnv }> {
  const root = await mkdtemp(join(tmpdir(), 'postgresql-snapshot-dispatch-'))
  roots.push(root)
  const gh = join(root, 'gh')
  const git = join(root, 'git')
  await writeFile(
    join(root, 'repo.json'),
    JSON.stringify({
      nameWithOwner: 'vouchington/vouchington',
      defaultBranchRef: { name: 'main' },
    }),
  )
  await writeFile(
    join(root, 'pr.json'),
    JSON.stringify({
      number: 663,
      headRefOid: head,
      headRepositoryOwner: { login: 'vouchington' },
      state: 'OPEN',
    }),
  )
  await writeFile(
    gh,
    `#!/bin/sh
case "$1 $2" in
  "repo view") exec /bin/cat "$FAKE_GH_ROOT/repo.json" ;;
  "pr view") exec /bin/cat "$FAKE_GH_ROOT/pr.json" ;;
  "workflow run") printf '%s\\n' "$*" >> "$FAKE_GH_ROOT/dispatch.log" ;;
  *) exit 2 ;;
esac
`,
  )
  await writeFile(
    git,
    `#!/bin/sh
printf '%s\\n' "$FAKE_GIT_HEAD"
`,
  )
  await chmod(gh, 0o755)
  await chmod(git, 0o755)
  return {
    root,
    env: {
      ...process.env,
      PATH: `${root}:${process.env.PATH}`,
      FAKE_GH_ROOT: root,
      FAKE_GIT_HEAD: head,
    },
  }
}

async function dispatch(env: NodeJS.ProcessEnv, ...args: string[]): Promise<void> {
  await execFile(process.execPath, ['dev/postgresql-snapshot-update.mts', ...args], {
    cwd: process.cwd(),
    env,
  })
}

describe('PostgreSQL snapshot dispatch command', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('dispatches the default-branch workflow for the pushed current PR head', async () => {
    const { root, env } = await fixture()
    await dispatch(env)
    expect(await readFile(join(root, 'dispatch.log'), 'utf8')).toContain(
      'workflow run postgresql-snapshot-update.yml --repo vouchington/vouchington --ref main -f pr_number=663',
    )
    await dispatch(env, '--pr', '663')
    expect((await readFile(join(root, 'dispatch.log'), 'utf8')).trim().split('\n')).toHaveLength(2)
  })

  it('rejects a local head that has not been pushed to the selected PR', async () => {
    const { root, env } = await fixture()
    await expect(dispatch({ ...env, FAKE_GIT_HEAD: 'b'.repeat(40) })).rejects.toThrow(/pushed HEAD/)
    await expect(readFile(join(root, 'dispatch.log'), 'utf8')).rejects.toThrow(/ENOENT/)
  })
})
