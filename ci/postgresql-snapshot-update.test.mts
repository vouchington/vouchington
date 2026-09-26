import { execFile as execFileCallback } from 'node:child_process'
import { chmod, cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  describeGeneratedSnapshotFiles,
  type SnapshotManifest,
} from './postgresql-snapshot-update-core.mts'

const execFile = promisify(execFileCallback)
const repository = 'vouchington/vouchington'
const baseSha = 'b'.repeat(40)
const headSha = 'a'.repeat(40)
const image = `pgvector/pgvector:pg18@sha256:${'c'.repeat(64)}`
const roots: string[] = []

async function fixture(): Promise<{ root: string; env: NodeJS.ProcessEnv; output: string }> {
  const root = await mkdtemp(join(tmpdir(), 'snapshot-controller-'))
  roots.push(root)
  const bin = join(root, 'bin')
  await mkdir(bin)
  const workflow = `jobs:\n  postgres-schema-tests:\n    services:\n      postgres:\n        image: ${image}\n`
  await writeFile(join(root, 'permission.json'), JSON.stringify({ permission: 'write' }))
  await writeFile(
    join(root, 'pr.json'),
    JSON.stringify({
      number: 663,
      state: 'open',
      head: { ref: 'feat/snapshot', sha: headSha, repo: { full_name: repository } },
      base: { ref: 'main', sha: baseSha, repo: { full_name: repository } },
    }),
  )
  await writeFile(
    join(root, 'compare.json'),
    JSON.stringify({
      status: 'ahead',
      merge_base_commit: { sha: baseSha },
    }),
  )
  await writeFile(
    join(root, 'workflow.json'),
    JSON.stringify({
      encoding: 'base64',
      content: Buffer.from(workflow).toString('base64'),
    }),
  )
  const mockGh = join(bin, 'gh')
  await writeFile(
    mockGh,
    `#!/bin/sh
case "$2" in
  */permission) exec /bin/cat "$FAKE_GH_ROOT/permission.json" ;;
  */pulls/*) exec /bin/cat "$FAKE_GH_ROOT/pr.json" ;;
  */compare/*) exec /bin/cat "$FAKE_GH_ROOT/compare.json" ;;
  */contents/*) exec /bin/cat "$FAKE_GH_ROOT/workflow.json" ;;
  *) exit 2 ;;
esac
`,
  )
  await chmod(mockGh, 0o755)
  const event = join(root, 'event.json')
  await writeFile(
    event,
    JSON.stringify({
      issue: { number: 663, pull_request: {} },
      comment: { body: '/postgresql-snapshot-update', user: { login: 'maintainer' } },
      repository: { default_branch: 'main', full_name: repository },
    }),
  )
  const output = join(root, 'output')
  await writeFile(output, '')
  return {
    root,
    output,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_GH_ROOT: root,
      GH_TOKEN: 'test-token',
      GITHUB_REPOSITORY: repository,
      GITHUB_EVENT_NAME: 'issue_comment',
      GITHUB_EVENT_PATH: event,
      GITHUB_REF: 'refs/heads/main',
      GITHUB_RUN_ID: '9',
      GITHUB_RUN_ATTEMPT: '1',
      GITHUB_OUTPUT: output,
    },
  }
}

async function runController(command: string, env: NodeJS.ProcessEnv): Promise<void> {
  await execFile(process.execPath, ['ci/postgresql-snapshot-update.mts', command], {
    cwd: process.cwd(),
    env,
  })
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (
    await execFile('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test Author',
        GIT_AUTHOR_EMAIL: 'test@example.invalid',
        GIT_COMMITTER_NAME: 'Test Author',
        GIT_COMMITTER_EMAIL: 'test@example.invalid',
      },
    })
  ).stdout.trim()
}

describe('PostgreSQL snapshot controller process', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('accepts an authorized exact comment and binds the PR revision and image', async () => {
    const { root, env, output } = await fixture()
    await writeFile(
      join(root, 'permission.json'),
      JSON.stringify({ permission: 'write', role_name: 'custom_role' }),
    )
    await runController('prepare', env)
    const values = await readFile(output, 'utf8')
    expect(values).toContain('accepted=true\n')
    expect(values).toContain(`head_sha=${headSha}\n`)
    expect(values).toContain(`postgres_image=${image}\n`)
  })

  it('rejects an unauthorized actor, fork PR, and stale base before generation', async () => {
    const { root, env, output } = await fixture()
    await writeFile(join(root, 'permission.json'), JSON.stringify({ permission: 'read' }))
    await expect(runController('prepare', env)).rejects.toThrow(/permission/)
    await writeFile(join(root, 'permission.json'), JSON.stringify({ permission: 'write' }))
    const pr = JSON.parse(await readFile(join(root, 'pr.json'), 'utf8'))
    pr.head.repo.full_name = 'fork/repo'
    await writeFile(join(root, 'pr.json'), JSON.stringify(pr))
    await expect(runController('prepare', env)).rejects.toThrow(/identity/)
    pr.head.repo.full_name = repository
    await writeFile(join(root, 'pr.json'), JSON.stringify(pr))
    await writeFile(
      join(root, 'compare.json'),
      JSON.stringify({
        status: 'diverged',
        merge_base_commit: { sha: headSha },
      }),
    )
    await expect(runController('prepare', env)).rejects.toThrow(/current base/)
    expect(await readFile(output, 'utf8')).toBe('')
  })

  it('rejects a non-default dispatch ref and ignores a non-command PR comment', async () => {
    const { env, output } = await fixture()
    await expect(
      runController('prepare', { ...env, GITHUB_REF: 'refs/heads/feature' }),
    ).rejects.toThrow(/default branch/)
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH!, 'utf8'))
    event.comment.body = '/postgresql-snapshot-update now'
    await writeFile(env.GITHUB_EVENT_PATH!, JSON.stringify(event))
    await runController('prepare', env)
    expect(await readFile(output, 'utf8')).toBe('')
  })

  it('publishes only generated changes and creates no commit for identical output', async () => {
    const { root, env } = await fixture()
    const candidate = join(root, 'candidate')
    const remote = join(root, 'remote.git')
    const snapshot = join(candidate, 'backend/data-stores/psql/schema-snapshot')
    await mkdir(join(snapshot, 'markdown'), { recursive: true })
    await writeFile(join(snapshot, 'schema.json'), '{}\n')
    await writeFile(join(snapshot, 'markdown/README.md'), '# Schema\n')
    await git(candidate, 'init', '-b', 'feat/snapshot')
    await git(candidate, 'add', '.')
    await git(candidate, 'commit', '-m', 'initial')
    const actualHead = await git(candidate, 'rev-parse', 'HEAD')
    await git(root, 'init', '--bare', remote)
    await git(candidate, 'remote', 'add', 'origin', remote)
    await git(candidate, 'push', 'origin', 'HEAD:refs/heads/feat/snapshot')
    const pr = JSON.parse(await readFile(join(root, 'pr.json'), 'utf8'))
    pr.head.sha = actualHead
    await writeFile(join(root, 'pr.json'), JSON.stringify(pr))
    const artifact = join(root, 'artifact')
    await mkdir(artifact)
    await cp(join(snapshot, 'schema.json'), join(artifact, 'schema.json'))
    await cp(join(snapshot, 'markdown'), join(artifact, 'markdown'), { recursive: true })
    const publishEnv = {
      ...env,
      SNAPSHOT_PUBLISH_TOKEN: 'test-publish-token',
      SNAPSHOT_PR_NUMBER: '663',
      SNAPSHOT_HEAD_REF: 'feat/snapshot',
      SNAPSHOT_HEAD_SHA: actualHead,
      SNAPSHOT_BASE_REF: 'main',
      SNAPSHOT_BASE_SHA: baseSha,
      SNAPSHOT_POSTGRES_IMAGE: image,
      SNAPSHOT_DEFAULT_BRANCH: 'main',
      SNAPSHOT_ARTIFACT_DIR: artifact,
      SNAPSHOT_CANDIDATE_DIR: candidate,
    }
    async function writeManifest(): Promise<void> {
      const manifest: SnapshotManifest = {
        formatVersion: 1,
        repository,
        prNumber: 663,
        headRef: 'feat/snapshot',
        headSha: actualHead,
        baseRef: 'main',
        baseSha,
        postgresImage: image,
        runId: 9,
        runAttempt: 1,
        files: await describeGeneratedSnapshotFiles(artifact),
      }
      await writeFile(join(artifact, 'manifest.json'), JSON.stringify(manifest))
    }
    await writeManifest()
    await runController('publish', publishEnv)
    expect(await git(candidate, 'rev-parse', 'HEAD')).toBe(actualHead)

    pr.head.sha = 'd'.repeat(40)
    await writeFile(join(root, 'pr.json'), JSON.stringify(pr))
    await expect(runController('publish', publishEnv)).rejects.toThrow(/identity/)
    pr.head.sha = actualHead
    await writeFile(join(root, 'pr.json'), JSON.stringify(pr))

    const markdownPath = join(snapshot, 'markdown/README.md')
    await rm(markdownPath)
    await symlink(join(root, 'permission.json'), markdownPath)
    await expect(runController('publish', publishEnv)).rejects.toThrow(
      /Unsafe snapshot destination/,
    )
    await rm(markdownPath)
    await writeFile(markdownPath, '# Schema\n')
    expect(await git(candidate, 'rev-parse', 'HEAD')).toBe(actualHead)

    await writeFile(join(artifact, 'schema.json'), '{"formatVersion":2}\n')
    await writeManifest()
    await runController('publish', publishEnv)
    expect(await git(candidate, 'rev-parse', 'HEAD')).not.toBe(actualHead)
    expect(await git(remote, 'rev-parse', 'refs/heads/feat/snapshot')).toBe(
      await git(candidate, 'rev-parse', 'HEAD'),
    )
    expect(
      await git(candidate, 'show', 'HEAD:backend/data-stores/psql/schema-snapshot/schema.json'),
    ).toBe('{"formatVersion":2}')
    expect(
      (await git(candidate, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).split(
        '\n',
      ),
    ).toEqual(['backend/data-stores/psql/schema-snapshot/schema.json'])
  })
})
