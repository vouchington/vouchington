import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const SCRIPT = resolve('ci/ghcr-package-retention.sh')
const DAY = 86_400_000
const UNMERGED = 'f'.repeat(40)

// Serves $PAGES_DIR/<package> as the paginated listing (one JSON array per page) and records the
// id of every DELETE. A package without a pages file answers like GitHub's missing package.
const FAKE_GH = `#!/usr/bin/env bash
if [ "$2" = --method ]; then echo "\${4##*/}" >> "$DELETES_PATH"; exit 0; fi
package=\${3#/orgs/*/packages/container/}; package=\${package%%/*}
if [ -n "$FAKE_LIST_ERROR" ]; then echo "$FAKE_LIST_ERROR" >&2; exit 1; fi
if [ ! -f "$PAGES_DIR/$package" ]; then echo 'gh: Package not found. (HTTP 404)' >&2; exit 1; fi
cat "$PAGES_DIR/$package"
`
const GIT_ENV = {
  GIT_AUTHOR_EMAIL: 'ci@example.test',
  GIT_AUTHOR_NAME: 'CI',
  GIT_COMMITTER_EMAIL: 'ci@example.test',
  GIT_COMMITTER_NAME: 'CI',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  PATH: process.env['PATH'] ?? '',
}

type Version = {
  id: number
  created_at: string
  updated_at: string
  metadata: { container: { tags: string[] } }
}

const now = Date.now()
const iso = (days: number) => new Date(now - days * DAY).toISOString().replace(/\.\d{3}Z$/u, 'Z')
let nextId = 1
function version(tags: string[], createdDaysAgo: number, updatedDaysAgo = createdDaysAgo): Version {
  return {
    id: nextId++,
    created_at: iso(createdDaysAgo),
    updated_at: iso(updatedDaysAgo),
    metadata: { container: { tags } },
  }
}
const referrer = (days: number) => version([`sha256-${'e'.repeat(64)}`], days)

describe('ghcr-package-retention', () => {
  const dirs: string[] = []
  let repo = ''
  let shallow = ''
  let revisions: string[] = []

  const temporaryDirectory = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-ghcr-retention-'))
    dirs.push(dir)
    return dir
  }
  const git = async (cwd: string, ...args: string[]) =>
    (await execFileAsync('git', args, { cwd, env: GIT_ENV })).stdout.trim()

  beforeAll(async () => {
    repo = await temporaryDirectory()
    await git(repo, 'init', '-q', '-b', 'main')
    await execFileAsync(
      'bash',
      ['-c', 'for i in $(seq 31); do git commit -q --allow-empty -m "$i"; done'],
      { cwd: repo, env: GIT_ENV },
    )
    revisions = (await git(repo, 'rev-list', 'HEAD')).split('\n')
    shallow = join(await temporaryDirectory(), 'shallow')
    await git(repo, 'clone', '-q', '--depth', '1', `file://${repo}`, shallow)
  })

  afterAll(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  type Run = {
    args?: string[]
    cwd?: string
    env?: Record<string, string>
    packages?: Record<string, Version[][]>
  }

  async function run({ args = ['--apply'], cwd = repo, env = {}, packages = {} }: Run) {
    const dir = await temporaryDirectory()
    const bin = join(dir, 'bin')
    const pagesDir = join(dir, 'pages')
    await Promise.all([mkdir(bin), mkdir(pagesDir)])
    await writeFile(join(bin, 'gh'), FAKE_GH)
    await chmod(join(bin, 'gh'), 0o755)
    for (const [name, pages] of Object.entries(packages))
      await writeFile(join(pagesDir, name), pages.map(page => JSON.stringify(page)).join('\n'))
    const deletesPath = join(dir, 'deletes')

    const result = await execFileAsync(SCRIPT, args, {
      cwd,
      env: {
        ...GIT_ENV,
        DELETES_PATH: deletesPath,
        FAKE_LIST_ERROR: '',
        GHCR_PACKAGES: Object.keys(packages).join(' ') || 'api',
        PAGES_DIR: pagesDir,
        PATH: `${bin}:${GIT_ENV.PATH}`,
        TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
        ...env,
      },
    }).then(
      value => ({ ok: true as const, ...value }),
      (err: { stderr: string }) => ({ ok: false as const, stderr: err.stderr }),
    )
    const deletes = await readFile(deletesPath, 'utf8').catch(() => '')
    return { deleted: deletes.split('\n').filter(Boolean).map(Number), result }
  }

  // One image per main commit, two days apart, each attested a few minutes after its push.
  function mainHistory() {
    const images = revisions.map((revision, index) => version([`sha-${revision}`], index * 2 + 1))
    const attachments = revisions.map((_revision, index) => version([], index * 2 + 0.99))
    return { attachments, images }
  }

  it('keeps the newest 30 main images and reaps what predates every surviving image', async () => {
    const { attachments, images } = mainHistory()
    const versions = [...images, ...attachments]

    const { deleted, result } = await run({
      packages: { api: [versions.slice(0, 40), versions.slice(40)] },
    })

    expect(result.ok).toBe(true)
    expect(deleted.toSorted()).toEqual([images[30]?.id, attachments[30]?.id].toSorted())
  })

  it('lists but deletes nothing by default', async () => {
    const { images } = mainHistory()

    const { deleted, result } = await run({ args: [], packages: { api: [images] } })

    expect(result.ok && result.stdout).toContain(`would delete ${images[30]?.id} `)
    expect(deleted).toEqual([])
  })

  it('reaps an unmerged image only once created and updated seven days ago', async () => {
    const stale = version([`sha-${UNMERGED}`], 8)
    const packages = {
      api: [
        [
          version([`sha-${revisions[0]}`], 0),
          stale,
          version([`sha-${UNMERGED}`], 8, 6),
          version([`sha-${UNMERGED}`], 6),
        ],
      ],
    }

    const { deleted, result } = await run({ packages })

    expect(result.ok).toBe(true)
    expect(deleted).toEqual([stale.id])
  })

  it('never deletes other tags or attachments that a surviving image may own', async () => {
    const packages = {
      api: [
        [
          version(['v1'], 101),
          // A platform manifest, pushed moments before the image index that references it.
          version([], 101.01),
          version([`sha-${UNMERGED}`, 'latest'], 100),
          version([`sha-${UNMERGED.slice(0, 7)}`], 100),
          version([], 100.5),
          referrer(100.5),
        ],
      ],
      // No image survives here, so nothing proves these attachments are orphaned.
      web: [[version([], 100), referrer(100)]],
    }

    const { deleted, result } = await run({ packages })

    expect(result.ok).toBe(true)
    expect(deleted).toEqual([])
  })

  it('skips a package that was never published', async () => {
    const { deleted, result } = await run({
      env: { GHCR_PACKAGES: 'worker-io' },
    })

    expect(result.ok && result.stdout).toContain('worker-io: no such package, skipping')
    expect(deleted).toEqual([])
  })

  it('fails closed on any other listing error', async () => {
    const { deleted, result } = await run({ env: { FAKE_LIST_ERROR: 'gh: Forbidden (HTTP 403)' } })

    expect(result.ok).toBe(false)
    expect(result.ok || result.stderr).toContain('HTTP 403')
    expect(deleted).toEqual([])
  })

  it('refuses a shallow history, where old main images would look unmerged', async () => {
    const { deleted, result } = await run({
      cwd: shallow,
      packages: { api: [[version([`sha-${UNMERGED}`], 30)]] },
    })

    expect(result.ok).toBe(false)
    expect(result.ok || result.stderr).toContain('full main history')
    expect(deleted).toEqual([])
  })

  it.each([
    [{ GHCR_KEEP_MAIN: '00' }, [], 'GHCR_KEEP_MAIN'],
    [{ GHCR_KEEP_MAIN: 'all' }, [], 'GHCR_KEEP_MAIN'],
    [{ GHCR_UNMERGED_MIN_AGE_DAYS: '-1' }, [], 'GHCR_UNMERGED_MIN_AGE_DAYS'],
    [{}, ['--force'], 'unknown argument'],
  ])('rejects invalid configuration %j %j', async (env, args, message) => {
    const { deleted, result } = await run({ args, env })

    expect(result.ok).toBe(false)
    expect(result.ok || result.stderr).toContain(message)
    expect(deleted).toEqual([])
  })
})
