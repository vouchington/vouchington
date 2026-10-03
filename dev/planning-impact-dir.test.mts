import { spawnSync } from 'node:child_process'
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PLANNING_IMPACT_MARKER_NAME,
  cleanupPlanningImpactDirectory,
  type PlanningImpactSession,
} from './planning-impact-dir.mts'

const scriptPath = join(import.meta.dirname, 'planning-impact-dir.mts')
const tempRoots: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'voucha-planning-impact-test-'))
  tempRoots.push(root)
  return root
}

async function createSession(root: string): Promise<PlanningImpactSession> {
  const result = spawnSync('node', [scriptPath, 'create'], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: root },
  })
  if (result.status !== 0) throw new Error(result.stderr || 'planning impact create failed')
  return JSON.parse(result.stdout) as PlanningImpactSession
}

async function cleanupSession(
  session: PlanningImpactSession,
  root: string,
): Promise<{ status: number; stderr: string }> {
  return cleanupInput(`${JSON.stringify(session)}\n`, root)
}

function cleanupInput(input: string, root: string): { status: number; stderr: string } {
  const result = spawnSync('node', [scriptPath, 'cleanup'], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: root },
    input,
  })
  return { status: result.status ?? -1, stderr: result.stderr }
}

describe('planning-impact-dir', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('removes the created private directory and preserves its sibling', async () => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    const sibling = join(root, 'no-mistakes-impact.abcdef')
    await mkdir(sibling, { mode: 0o700 })
    await writeFile(join(session.directory, 'evidence.json'), '{}')

    expect((await lstat(session.directory)).mode & 0o777).toBe(0o700)
    expect(session.cleanupToken).toMatch(/^[a-f0-9]{64}$/u)
    expect(await cleanupSession(session, root)).toMatchObject({ status: 0 })
    await expect(lstat(session.directory)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await lstat(sibling)).isDirectory()).toBe(true)
  })

  it('refuses another valid session capability without deleting either directory', async () => {
    const root = await makeTempRoot()
    const first = await createSession(root)
    const second = await createSession(root)

    expect(
      await cleanupSession({ ...second, cleanupToken: first.cleanupToken }, root),
    ).toMatchObject({
      status: 1,
    })
    expect((await lstat(first.directory)).isDirectory()).toBe(true)
    expect((await lstat(second.directory)).isDirectory()).toBe(true)
    expect(await cleanupSession(first, root)).toMatchObject({ status: 0 })
    expect(await cleanupSession(second, root)).toMatchObject({ status: 0 })
  })

  it.each([
    [
      'malformed generated name',
      (session: PlanningImpactSession) => ({
        ...session,
        directory: join(tmpdir(), 'no-mistakes-impact.bad'),
      }),
    ],
    [
      'path outside the configured root',
      (session: PlanningImpactSession) => ({
        ...session,
        directory: join(tmpdir(), 'no-mistakes-impact.abcdef'),
      }),
    ],
    [
      'wrong capability',
      (session: PlanningImpactSession) => ({
        ...session,
        cleanupToken: '0'.repeat(64),
      }),
    ],
  ])('refuses %s without deleting the generated directory', async (_label, alterSession) => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    const invalid = alterSession(session)

    expect(await cleanupSession(invalid, root)).toMatchObject({ status: 1 })
    expect((await lstat(session.directory)).isDirectory()).toBe(true)
    expect(await cleanupSession(session, root)).toMatchObject({ status: 0 })
  })

  it('refuses a root symlink without deleting its target', async () => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    const outside = await makeTempRoot()
    const sentinel = join(outside, 'sentinel')
    await writeFile(sentinel, 'keep')

    const moved = join(outside, 'moved-impact-dir')
    await rm(session.directory, { recursive: true })
    await mkdir(moved, { mode: 0o700 })
    await writeFile(join(moved, 'sentinel'), 'keep')
    await symlink(moved, session.directory)
    expect(await cleanupSession(session, root)).toMatchObject({ status: 1 })
    expect((await lstat(session.directory)).isSymbolicLink()).toBe(true)
    expect(await readFile(join(moved, 'sentinel'), 'utf8')).toBe('keep')
    await rm(session.directory)
  })

  it('refuses a marker symlink without following it', async () => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    const outside = await makeTempRoot()
    const sentinel = join(outside, 'sentinel')
    await writeFile(sentinel, 'keep')
    const markerPath = join(session.directory, PLANNING_IMPACT_MARKER_NAME)
    await rm(markerPath)
    await symlink(sentinel, markerPath)

    expect(await cleanupSession(session, root)).toMatchObject({ status: 1 })
    expect((await lstat(session.directory)).isDirectory()).toBe(true)
    expect(await readFile(sentinel, 'utf8')).toBe('keep')
  })

  it('refuses a symlink anywhere in the generated tree', async () => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    const outside = await makeTempRoot()
    const sentinel = join(outside, 'sentinel')
    await writeFile(sentinel, 'keep')
    await symlink(sentinel, join(session.directory, 'unexpected-link'))

    expect(await cleanupSession(session, root)).toMatchObject({ status: 1 })
    expect((await lstat(session.directory)).isDirectory()).toBe(true)
    expect(await readFile(sentinel, 'utf8')).toBe('keep')
  })

  it('refuses a tampered marker and preserves the generated directory', async () => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    const marker = join(session.directory, PLANNING_IMPACT_MARKER_NAME)
    await writeFile(marker, 'tampered\n')

    expect(await cleanupSession(session, root)).toMatchObject({ status: 1 })
    expect((await lstat(session.directory)).isDirectory()).toBe(true)
  })

  it('does not echo malformed session input to stderr', async () => {
    const root = await makeTempRoot()
    const capability = 'private-capability-must-not-appear'
    const result = cleanupInput(`{"cleanupToken":"${capability}`, root)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('planning impact session input must be valid JSON')
    expect(result.stderr).not.toContain(capability)
  })

  it('refuses a marker with broader permissions and accepts it after repair', async () => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    const marker = join(session.directory, PLANNING_IMPACT_MARKER_NAME)
    await chmod(marker, 0o644)

    expect(await cleanupSession(session, root)).toMatchObject({ status: 1 })
    await chmod(marker, 0o600)
    expect(await cleanupSession(session, root)).toMatchObject({ status: 0 })
  })

  it('refuses non-directories, missing paths, and non-private roots', async () => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    await rm(session.directory, { recursive: true })
    await writeFile(session.directory, 'file')
    expect(await cleanupSession(session, root)).toMatchObject({ status: 1 })
    await rm(session.directory)
    expect(await cleanupSession(session, root)).toMatchObject({ status: 1 })

    const privateSession = await createSession(root)
    await chmod(privateSession.directory, 0o755)
    expect(await cleanupSession(privateSession, root)).toMatchObject({ status: 1 })
    await chmod(privateSession.directory, 0o700)
    expect(await cleanupSession(privateSession, root)).toMatchObject({ status: 0 })
  })

  it('rejects a different owner before invoking removal', async () => {
    const root = await makeTempRoot()
    const session = await createSession(root)
    const owner = (await lstat(session.directory)).uid
    vi.stubEnv('TMPDIR', root)
    const uid = vi.spyOn(process, 'geteuid').mockReturnValue(owner + 1)

    await expect(cleanupPlanningImpactDirectory(session)).rejects.toThrow(/owned by the caller/u)
    expect((await lstat(session.directory)).isDirectory()).toBe(true)
    uid.mockRestore()
    expect(await cleanupSession(session, root)).toMatchObject({ status: 0 })
  })

  it('accepts a configured temp-root symlink alias', async () => {
    const physicalRoot = await makeTempRoot()
    const alias = join(await makeTempRoot(), 'tmp-alias')
    await symlink(physicalRoot, alias)
    const session = await createSession(alias)

    expect(session.directory.startsWith(`${alias}/no-mistakes-impact.`)).toBe(true)
    expect(await cleanupSession(session, alias)).toMatchObject({ status: 0 })
  })
})
