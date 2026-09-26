import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { regularSnapshotFiles } from './postgresql-snapshot-files.mts'
import { isPinnedPostgresImage } from './postgresql-snapshot-image.mts'

export { assertSafeSnapshotDestination } from './postgresql-snapshot-files.mts'
export { postgresImageFromWorkflow } from './postgresql-snapshot-image.mts'

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
  if (!isPinnedPostgresImage(manifest.postgresImage) || !shaPattern.test(manifest.headSha)) {
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
