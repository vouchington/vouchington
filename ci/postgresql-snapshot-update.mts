import { execFile as execFileCallback } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { promisify } from 'node:util'
import {
  assertSnapshotManifest,
  assertSafeSnapshotDestination,
  describeGeneratedSnapshotFiles,
  isGeneratedSnapshotPath,
  type SnapshotIdentity,
  type SnapshotManifest,
} from './postgresql-snapshot-update-core.mts'
import { assertPublishTarget, candidateImage } from './postgresql-snapshot-github.mts'
import { prepareSnapshotRequest } from './postgresql-snapshot-prepare.mts'

const execFile = promisify(execFileCallback)
const snapshotPath = 'backend/data-stores/psql/schema-snapshot'

function required(name: string, value = process.env[name]): string {
  if (!value) throw new Error(`${name} is required`)
  return value
}

function numeric(name: string, raw = process.env[name]): number {
  const value = Number(required(name, raw))
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`)
  return value
}

function identityFromEnvironment(): SnapshotIdentity {
  return {
    repository: required('GITHUB_REPOSITORY'),
    prNumber: numeric('SNAPSHOT_PR_NUMBER', process.env.SNAPSHOT_PR_NUMBER),
    headRef: required('SNAPSHOT_HEAD_REF', process.env.SNAPSHOT_HEAD_REF),
    headSha: required('SNAPSHOT_HEAD_SHA', process.env.SNAPSHOT_HEAD_SHA),
    baseRef: required('SNAPSHOT_BASE_REF', process.env.SNAPSHOT_BASE_REF),
    baseSha: required('SNAPSHOT_BASE_SHA', process.env.SNAPSHOT_BASE_SHA),
    postgresImage: required('SNAPSHOT_POSTGRES_IMAGE', process.env.SNAPSHOT_POSTGRES_IMAGE),
    runId: numeric('GITHUB_RUN_ID'),
    runAttempt: numeric('GITHUB_RUN_ATTEMPT'),
  }
}

async function generateManifest(): Promise<void> {
  const identity = identityFromEnvironment()
  const source = join(required('GITHUB_WORKSPACE'), snapshotPath)
  const target = required('SNAPSHOT_ARTIFACT_DIR', process.env.SNAPSHOT_ARTIFACT_DIR)
  await mkdir(target, { recursive: true })
  await Promise.all([
    cp(join(source, 'schema.json'), join(target, 'schema.json'), { dereference: false }),
    cp(join(source, 'markdown'), join(target, 'markdown'), {
      recursive: true,
      dereference: false,
    }),
  ])
  const files = await describeGeneratedSnapshotFiles(target)
  const manifest: SnapshotManifest = { formatVersion: 1, ...identity, files }
  await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest)}\n`)
}

async function copySnapshotFile(
  checkout: string,
  artifactRoot: string,
  relative: string,
): Promise<void> {
  const destination = join(checkout, snapshotPath, relative)
  await assertSafeSnapshotDestination(checkout, `${snapshotPath}/${relative}`)
  await mkdir(dirname(destination), { recursive: true })
  return copyFile(join(artifactRoot, relative), destination)
}

async function publish(): Promise<void> {
  const identity = identityFromEnvironment()
  const artifactRoot = required('SNAPSHOT_ARTIFACT_DIR', process.env.SNAPSHOT_ARTIFACT_DIR)
  const checkout = required('SNAPSHOT_CANDIDATE_DIR', process.env.SNAPSHOT_CANDIDATE_DIR)
  const defaultBranch = required('SNAPSHOT_DEFAULT_BRANCH', process.env.SNAPSHOT_DEFAULT_BRANCH)
  const manifest = JSON.parse(
    await readFile(join(artifactRoot, 'manifest.json'), 'utf8'),
  ) as SnapshotManifest
  const files = await assertSnapshotManifest(artifactRoot, manifest, identity)
  if (
    (await execFile('git', ['rev-parse', 'HEAD'], { cwd: checkout })).stdout.trim() !==
    identity.headSha
  ) {
    throw new Error('Publisher checkout does not match requested PR head')
  }
  if ((await candidateImage(identity.repository, identity.headSha)) !== identity.postgresImage) {
    throw new Error('Candidate PostgreSQL image changed')
  }
  await assertPublishTarget(identity, defaultBranch)

  const target = join(checkout, snapshotPath)
  const tracked = await execFile('git', ['ls-files', '-z', '--', snapshotPath], { cwd: checkout })
  for (const path of tracked.stdout.split('\0').filter(Boolean)) {
    const relative = path.slice(snapshotPath.length + 1)
    if (!isGeneratedSnapshotPath(relative)) continue
    await assertSafeSnapshotDestination(checkout, `${snapshotPath}/${relative}`)
    if (!files.includes(relative)) await rm(join(target, relative))
  }
  for (const relative of files) {
    await copySnapshotFile(checkout, artifactRoot, relative)
  }
  await execFile(
    'git',
    ['add', '-A', '--', `${snapshotPath}/schema.json`, `${snapshotPath}/markdown`],
    {
      cwd: checkout,
    },
  )
  const staged = (
    await execFile('git', ['diff', '--cached', '--name-only', '-z'], { cwd: checkout })
  ).stdout
    .split('\0')
    .filter(Boolean)
  if (
    staged.some(
      path =>
        !path.startsWith(`${snapshotPath}/`) ||
        !isGeneratedSnapshotPath(path.slice(snapshotPath.length + 1)),
    )
  ) {
    throw new Error('Publisher staged a path outside generated snapshot files')
  }
  if (staged.length === 0) {
    console.log(`Snapshot already current for PR #${identity.prNumber}; no commit needed.`)
    return
  }
  const author = 'github-actions[bot]'
  const email = '41898282+github-actions[bot]@users.noreply.github.com'
  await execFile(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-m',
      'docs(db): update PostgreSQL schema snapshot',
    ],
    {
      cwd: checkout,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: author,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: author,
        GIT_COMMITTER_EMAIL: email,
      },
    },
  )
  await assertPublishTarget(identity, defaultBranch)
  const token = required('SNAPSHOT_PUBLISH_TOKEN', process.env.SNAPSHOT_PUBLISH_TOKEN)
  const authorization = Buffer.from(`x-access-token:${token}`).toString('base64')
  await execFile(
    'git',
    ['-c', 'core.hooksPath=/dev/null', 'push', 'origin', `HEAD:refs/heads/${identity.headRef}`],
    {
      cwd: checkout,
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraheader',
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: Basic ${authorization}`,
      },
    },
  )
  console.log(`Published schema snapshot for PR #${identity.prNumber}`)
}

const command = process.argv[2]
if (command === 'prepare') await prepareSnapshotRequest()
else if (command === 'manifest') await generateManifest()
else if (command === 'publish') await publish()
else throw new Error('Usage: postgresql-snapshot-update.mts <prepare|manifest|publish>')
