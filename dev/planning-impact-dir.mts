#!/usr/bin/env node

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, lstat, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

export const PLANNING_IMPACT_MARKER_NAME = '.planning-impact-cleanup-sha256'

export type PlanningImpactSession = {
  directory: string
  cleanupToken: string
}

function requireUid(uid = process.geteuid?.()): number {
  if (uid === undefined) throw new Error('planning impact cleanup requires POSIX ownership checks')
  return uid
}

function tempRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.TMPDIR && env.TMPDIR !== '' ? env.TMPDIR : '/tmp')
}

function hasGeneratedName(path: string): boolean {
  return /^no-mistakes-impact\.[A-Za-z0-9]{6}$/u.test(path)
}

function parseSession(value: unknown): PlanningImpactSession {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('expected a planning impact session object')
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).toSorted().join(',') !== 'cleanupToken,directory' ||
    typeof record.directory !== 'string' ||
    typeof record.cleanupToken !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(record.cleanupToken)
  ) {
    throw new Error('invalid planning impact session object')
  }
  return { directory: record.directory, cleanupToken: record.cleanupToken }
}

function markerDigest(token: string, parent: string, basename: string): string {
  return createHash('sha256')
    .update(token)
    .update('\0')
    .update(parent)
    .update('\0')
    .update(basename)
    .digest('hex')
}

async function requireOwnedTree(directory: string, uid: number): Promise<void> {
  await Promise.all(
    (await readdir(directory)).map(async entry => {
      const path = join(directory, entry)
      const status = await lstat(path)
      if (status.isSymbolicLink()) throw new Error('planning impact tree contains a symlink')
      if (status.uid !== uid) throw new Error('planning impact tree contains a foreign owner')
      if (status.isDirectory()) await requireOwnedTree(path, uid)
      else if (!status.isFile())
        throw new Error('planning impact tree contains an unexpected file type')
    }),
  )
}

export async function createPlanningImpactDirectory(): Promise<PlanningImpactSession> {
  const parent = tempRoot()
  const realParent = await realpath(parent)
  const uid = requireUid()
  const directory = await mkdtemp(join(parent, 'no-mistakes-impact.'))
  await chmod(directory, 0o700)
  const status = await lstat(directory)
  const basename = directory.slice(directory.lastIndexOf(sep) + 1)
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    status.uid !== uid ||
    (status.mode & 0o7777) !== 0o700 ||
    !hasGeneratedName(basename) ||
    (await realpath(dirname(directory))) !== realParent
  ) {
    throw new Error('created planning impact directory failed its safety checks')
  }
  const cleanupToken = randomBytes(32).toString('hex')
  const marker = join(directory, PLANNING_IMPACT_MARKER_NAME)
  await writeFile(marker, `${markerDigest(cleanupToken, realParent, basename)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  await chmod(marker, 0o600)
  return { directory, cleanupToken }
}

export async function cleanupPlanningImpactDirectory(input: unknown): Promise<void> {
  const session = parseSession(input)
  const parent = tempRoot()
  const realParent = await realpath(parent)
  const directory = session.directory
  if (
    !directory.startsWith(sep) ||
    resolve(directory) !== directory ||
    dirname(directory) !== parent ||
    !hasGeneratedName(directory.slice(directory.lastIndexOf(sep) + 1))
  ) {
    throw new Error('refusing to remove an unexpected planning impact path')
  }
  if ((await realpath(dirname(directory))) !== realParent)
    throw new Error('refusing to remove a planning impact path outside the configured temp root')

  const uid = requireUid()
  const directoryStatus = await lstat(directory)
  if (
    directoryStatus.isSymbolicLink() ||
    !directoryStatus.isDirectory() ||
    directoryStatus.uid !== uid ||
    (directoryStatus.mode & 0o7777) !== 0o700
  ) {
    throw new Error('planning impact directory must be a private directory owned by the caller')
  }

  const basename = directory.slice(directory.lastIndexOf(sep) + 1)
  const markerPath = join(directory, PLANNING_IMPACT_MARKER_NAME)
  const markerStatus = await lstat(markerPath)
  if (
    markerStatus.isSymbolicLink() ||
    !markerStatus.isFile() ||
    markerStatus.uid !== uid ||
    markerStatus.nlink !== 1 ||
    (markerStatus.mode & 0o7777) !== 0o600
  ) {
    throw new Error('planning impact cleanup marker must be a private regular file')
  }
  const markerContents = await readFile(markerPath, 'utf8')
  const expected = Buffer.from(markerDigest(session.cleanupToken, realParent, basename), 'hex')
  const actual = Buffer.from(markerContents.slice(0, -1), 'hex')
  if (
    markerContents.length !== 65 ||
    markerContents[64] !== '\n' ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    throw new Error('planning impact cleanup token does not own this directory')

  await requireOwnedTree(directory, uid)
  await rm(directory, { recursive: true })
}

async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 4096) throw new Error('planning impact session input exceeds 4 KiB')
    chunks.push(buffer)
  }
  const input = Buffer.concat(chunks).toString('utf8').trim()
  if (!input) throw new Error('planning impact session input is required on stdin')
  try {
    return JSON.parse(input) as unknown
  } catch {
    throw new Error('planning impact session input must be valid JSON')
  }
}

async function main(): Promise<void> {
  const [command, ...extra] = process.argv.slice(2)
  if (command === '--help' && extra.length === 0) {
    process.stdout.write(
      'Usage: node dev/planning-impact-dir.mts create\n       node dev/planning-impact-dir.mts cleanup < session.json\n',
    )
    return
  }
  if (extra.length !== 0) throw new Error('planning impact directory command accepts no arguments')
  if (command === 'create') {
    process.stdout.write(`${JSON.stringify(await createPlanningImpactDirectory())}\n`)
    return
  }
  if (command === 'cleanup') {
    await cleanupPlanningImpactDirectory(await readStdinJson())
    return
  }
  throw new Error('expected the create or cleanup command')
}

if (import.meta.main) {
  main().catch(err => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
}
