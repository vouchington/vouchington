import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { regularSnapshotFiles } from './postgresql-snapshot-files.mts'

export interface PullRequestIdentity {
  number: number
  state: string
  head: { ref: string; sha: string; repo: { full_name: string } }
  base: { ref: string; sha: string; repo: { full_name: string } }
}

export interface SnapshotIdentity {
  repository: string
  prNumber: number
  headRef: string
  headSha: string
  baseRef: string
  baseSha: string
  postgresImage: string
  runId: number
  runAttempt: number
}

export interface SnapshotManifest extends SnapshotIdentity {
  formatVersion: 1
  files: Record<string, { size: number; sha256: string }>
}

const shaPattern = /^[0-9a-f]{40}$/u
const imagePattern = /^pgvector\/pgvector:pg18@sha256:[0-9a-f]{64}$/u
const generatedPathPattern = /^markdown\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.md$/u

export function parseSnapshotRequest(
  eventName: string,
  commentBody: string | undefined,
  manualPrNumber: string | undefined,
): number | null {
  if (eventName === 'issue_comment') {
    if (commentBody?.trim() !== '/postgresql-snapshot-update') return null
    if (!manualPrNumber || !/^[1-9]\d*$/u.test(manualPrNumber)) {
      throw new Error('PR comment event has no valid issue number')
    }
    return Number(manualPrNumber)
  }
  if (eventName !== 'workflow_dispatch') throw new Error('Unsupported snapshot request event')
  if (!manualPrNumber || !/^[1-9]\d*$/u.test(manualPrNumber)) {
    throw new Error('pr_number must be a positive integer')
  }
  return Number(manualPrNumber)
}

export function assertCurrentPullRequest(
  pullRequest: PullRequestIdentity,
  expected: Pick<
    SnapshotIdentity,
    'repository' | 'prNumber' | 'headRef' | 'headSha' | 'baseRef' | 'baseSha'
  >,
  defaultBranch: string,
): void {
  if (
    pullRequest.number !== expected.prNumber ||
    pullRequest.state !== 'open' ||
    pullRequest.head.repo.full_name !== expected.repository ||
    pullRequest.base.repo.full_name !== expected.repository ||
    pullRequest.head.ref !== expected.headRef ||
    pullRequest.head.sha !== expected.headSha ||
    pullRequest.base.ref !== expected.baseRef ||
    pullRequest.base.sha !== expected.baseSha ||
    pullRequest.head.ref === defaultBranch ||
    !shaPattern.test(pullRequest.head.sha) ||
    !shaPattern.test(pullRequest.base.sha)
  ) {
    throw new Error('Pull request identity or revision changed; refusing snapshot update')
  }
}

export function postgresImageFromWorkflow(workflow: string): string {
  const rootJobs = [...workflow.matchAll(/^jobs:\r?\n((?:(?:[ \t]+[^\r\n]*|[ \t]*)\r?\n)*)/gmu)]
  if ([...workflow.matchAll(/^jobs:/gmu)].length !== 1 || rootJobs.length !== 1) {
    throw new Error('Expected one root jobs block in schema workflow')
  }
  const jobs = [
    ...rootJobs[0]![1]!.matchAll(
      /^ {2}postgres-schema-tests:\r?\n((?:(?: {4,}[^\r\n]*|[ \t]*)\r?\n)*)/gmu,
    ),
  ]
  if (jobs.length !== 1 || !rootJobs[0]![1]!.startsWith(jobs[0]![0]))
    throw new Error('Expected one postgres-schema-tests job in schema workflow')
  const services = [
    ...jobs[0]![1]!.matchAll(/^ {4}services:\r?\n((?:(?: {6,}[^\r\n]*|[ \t]*)\r?\n)*)/gmu),
  ]
  if (services.length !== 1) throw new Error('Expected one services block in PostgreSQL schema job')
  const postgres = [
    ...services[0]![1]!.matchAll(/^ {6}postgres:\r?\n((?:(?: {8,}[^\r\n]*|[ \t]*)\r?\n)*)/gmu),
  ]
  if (postgres.length !== 1)
    throw new Error('Expected one postgres service in PostgreSQL schema job')
  const images = [...postgres[0]![1]!.matchAll(/^ {8}image: ([^\r\n]+)\r?$/gmu)].map(
    match => match[1]!,
  )
  if (images.length !== 1 || !imagePattern.test(images[0]!)) {
    throw new Error('Expected exactly one digest-pinned PostgreSQL 18 image in schema workflow')
  }
  return images[0]!
}

export function isGeneratedSnapshotPath(path: string): boolean {
  return path === 'schema.json' || path === 'markdown/README.md' || generatedPathPattern.test(path)
}

export async function describeGeneratedSnapshotFiles(
  root: string,
): Promise<SnapshotManifest['files']> {
  const files: SnapshotManifest['files'] = {}
  const paths = (await regularSnapshotFiles(root)).filter(path => path !== 'manifest.json')
  if (
    paths.length < 2 ||
    paths.length > 1000 ||
    !paths.includes('schema.json') ||
    !paths.includes('markdown/README.md')
  ) {
    throw new Error('Snapshot artifact has missing or excessive generated files')
  }
  for (const path of paths) {
    if (!isGeneratedSnapshotPath(path))
      throw new Error(`Unexpected snapshot artifact path: ${path}`)
    const content = await readFile(join(root, path))
    if (content.length > 20_000_000) throw new Error(`Snapshot artifact file is too large: ${path}`)
    files[path] = {
      size: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
    }
  }
  return files
}

export async function assertSnapshotManifest(
  root: string,
  manifest: SnapshotManifest,
  expected: SnapshotIdentity,
): Promise<string[]> {
  if (manifest.formatVersion !== 1) throw new Error('Unsupported snapshot artifact manifest')
  for (const key of Object.keys(expected) as Array<keyof SnapshotIdentity>) {
    if (manifest[key] !== expected[key])
      throw new Error(`Snapshot artifact ${key} does not match request`)
  }
  if (!imagePattern.test(manifest.postgresImage) || !shaPattern.test(manifest.headSha)) {
    throw new Error('Snapshot artifact provenance is malformed')
  }
  const actual = await describeGeneratedSnapshotFiles(root)
  const actualPaths = Object.keys(actual).sort()
  const declaredPaths = Object.keys(manifest.files).sort()
  if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
    throw new Error('Snapshot artifact file inventory differs from manifest')
  }
  for (const path of actualPaths) {
    const observed = actual[path]!
    const declared = manifest.files[path]
    if (observed.size !== declared?.size || observed.sha256 !== declared.sha256) {
      throw new Error(`Snapshot artifact hash mismatch: ${path}`)
    }
  }
  return actualPaths
}

export async function assertSafeSnapshotDestination(root: string, relative: string): Promise<void> {
  const rootStatus = await lstat(root)
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    throw new Error('Unsafe snapshot checkout root')
  }
  let current = root
  for (const part of relative.split('/')) {
    current = join(current, part)
    try {
      const status = await lstat(current)
      const isLeaf = current === join(root, relative)
      if (status.isSymbolicLink() || (isLeaf ? !status.isFile() : !status.isDirectory())) {
        throw new Error(`Unsafe snapshot destination: ${relative}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
