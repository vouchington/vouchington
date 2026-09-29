import { execFile as execFileCallback } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const roots: string[] = []
const head = 'a'.repeat(40)
const openPullRequest = {
  number: 663,
  headRefOid: head,
  headRepositoryOwner: { login: 'vouchington' },
  state: 'OPEN',
}

async function fixture(
  pullRequest: typeof openPullRequest = openPullRequest,
): Promise<{ root: string; env: NodeJS.ProcessEnv }> {
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
  await writeFile(join(root, 'pr.json'), JSON.stringify(pullRequest))
  await writeFile(
    gh,
    `#!/bin/sh
printf '%s\\n' "GH_REPO=\${GH_REPO-} $*" >> "$FAKE_GH_ROOT/gh.log"
case "$1 $2" in
  "repo view") exec /bin/cat "$FAKE_GH_ROOT/repo.json" ;;
  "pr view")
    if [ "\${FAKE_GH_PR_EXIT:-0}" -ne 0 ]; then exit "$FAKE_GH_PR_EXIT"; fi
    exec /bin/cat "$FAKE_GH_ROOT/pr.json" ;;
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

function pullRequestViewLines(log: string): string[] {
  return log.split('\n').filter(line => line.includes(' pr view '))
}

describe('PostgreSQL snapshot dispatch command', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('dispatches the inferred current PR and an explicit PR number', async () => {
    const { root, env } = await fixture()
    await dispatch(env)
    await dispatch(env, '--pr', '663')
    await dispatch(env, '--', '--pr', '663')

    expect(await readFile(join(root, 'dispatch.log'), 'utf8')).toBe(
      'workflow run postgresql-snapshot-update.yml --repo vouchington/vouchington --ref main -f pr_number=663\n'.repeat(
        3,
      ),
    )
    expect(pullRequestViewLines(await readFile(join(root, 'gh.log'), 'utf8'))).toEqual([
      'GH_REPO=vouchington/vouchington pr view --json number,headRefOid,headRepositoryOwner,state',
      'GH_REPO=vouchington/vouchington pr view 663 --repo vouchington/vouchington --json number,headRefOid,headRepositoryOwner,state',
      'GH_REPO=vouchington/vouchington pr view 663 --repo vouchington/vouchington --json number,headRefOid,headRepositoryOwner,state',
    ])
  })

  it('accepts the documented pnpm --pr forwarding form', async () => {
    const { root, env } = await fixture()
    await execFile('pnpm', ['run', 'db:snapshot:update', '--', '--pr', '663'], {
      cwd: process.cwd(),
      env,
    })
    expect(await readFile(join(root, 'dispatch.log'), 'utf8')).toContain('pr_number=663')
    expect(pullRequestViewLines(await readFile(join(root, 'gh.log'), 'utf8'))).toEqual([
      'GH_REPO=vouchington/vouchington pr view 663 --repo vouchington/vouchington --json number,headRefOid,headRepositoryOwner,state',
    ])
  })

  it('rejects a local head that has not been pushed to the selected PR', async () => {
    const { root, env } = await fixture()
    await expect(dispatch({ ...env, FAKE_GIT_HEAD: 'b'.repeat(40) })).rejects.toThrow(/pushed HEAD/)
    await expect(readFile(join(root, 'dispatch.log'), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('rejects a closed pull request before dispatch', async () => {
    const { root, env } = await fixture({ ...openPullRequest, state: 'CLOSED' })
    await expect(dispatch(env, '--pr', '663')).rejects.toThrow(/pushed HEAD/)
    await expect(readFile(join(root, 'dispatch.log'), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('rejects a fork pull request before dispatch', async () => {
    const { root, env } = await fixture({
      ...openPullRequest,
      headRepositoryOwner: { login: 'other' },
    })
    await expect(dispatch(env)).rejects.toThrow(/pushed HEAD/)
    await expect(readFile(join(root, 'dispatch.log'), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('rejects a missing pull request before dispatch', async () => {
    const { root, env } = await fixture()
    await expect(dispatch({ ...env, FAKE_GH_PR_EXIT: '1' })).rejects.toThrow(
      /Command failed: gh pr view/,
    )
    await expect(readFile(join(root, 'dispatch.log'), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('rejects an incomplete explicit pull request argument', async () => {
    const { root, env } = await fixture()
    await expect(dispatch(env, '--pr')).rejects.toThrow(/Usage:/)
    await expect(readFile(join(root, 'gh.log'), 'utf8')).rejects.toThrow(/ENOENT/)
  })
})
