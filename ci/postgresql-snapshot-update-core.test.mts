import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertCurrentPullRequest,
  assertSnapshotManifest,
  assertSafeSnapshotDestination,
  describeGeneratedSnapshotFiles,
  parseSnapshotRequest,
  postgresImageFromWorkflow,
} from './postgresql-snapshot-update-core.mts'

const sha = 'a'.repeat(40)
const base = 'b'.repeat(40)
const digest = 'c'.repeat(64)
const image = `pgvector/pgvector:pg18@sha256:${digest}`
const repository = 'vouchington/vouchington'
const identity = {
  repository,
  prNumber: 663,
  headRef: 'feat/snapshot',
  headSha: sha,
  baseRef: 'main',
  baseSha: base,
  postgresImage: image,
  runId: 9,
  runAttempt: 2,
} as const

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postgresql-snapshot-update-'))
  await mkdir(join(root, 'markdown/tables'), { recursive: true })
  await writeFile(join(root, 'schema.json'), '{"formatVersion":2}\n')
  await writeFile(join(root, 'markdown/README.md'), '# Schema\n')
  await writeFile(join(root, 'markdown/tables/posts.md'), '# Posts\n')
  return root
}

describe('PostgreSQL snapshot update contracts', () => {
  it('accepts only an exact PR comment or a numeric manual PR input', () => {
    expect(parseSnapshotRequest('issue_comment', ' /postgresql-snapshot-update\n', '663')).toBe(663)
    expect(
      parseSnapshotRequest('issue_comment', '/postgresql-snapshot-update now', '663'),
    ).toBeNull()
    expect(parseSnapshotRequest('workflow_dispatch', undefined, '663')).toBe(663)
    expect(() => parseSnapshotRequest('workflow_dispatch', undefined, '0')).toThrow(/pr_number/)
  })

  it('requires an open same-repository PR on a non-default head with an unchanged base and head', () => {
    const pr = {
      number: 663,
      state: 'open',
      head: { ref: identity.headRef, sha, repo: { full_name: repository } },
      base: { ref: identity.baseRef, sha: base, repo: { full_name: repository } },
    }
    expect(() => assertCurrentPullRequest(pr, identity, 'main')).not.toThrow(
      'Pull request identity or revision changed',
    )
    expect(() => assertCurrentPullRequest({ ...pr, state: 'closed' }, identity, 'main')).toThrow(
      'Pull request identity or revision changed',
    )
    expect(() =>
      assertCurrentPullRequest({ ...pr, head: { ...pr.head, sha: base } }, identity, 'main'),
    ).toThrow('Pull request identity or revision changed')
    expect(() =>
      assertCurrentPullRequest(
        { ...pr, head: { ...pr.head, repo: { full_name: 'fork/repo' } } },
        identity,
        'main',
      ),
    ).toThrow('Pull request identity or revision changed')
    expect(() =>
      assertCurrentPullRequest(
        { ...pr, head: { ...pr.head, ref: 'main' } },
        { ...identity, headRef: 'main' },
        'main',
      ),
    ).toThrow('Pull request identity or revision changed')
  })

  it('extracts the exact PostgreSQL service image from candidate workflow data', () => {
    const workflow = `jobs:\n  postgres-schema-tests:\n    services:\n      postgres:\n        image: ${image}\n      valkey:\n        image: valkey/valkey-bundle:9\n`
    expect(postgresImageFromWorkflow(workflow)).toBe(image)
    expect(() => postgresImageFromWorkflow(workflow.replace(image, 'postgres:18'))).toThrow(
      'Expected exactly one digest-pinned PostgreSQL 18 image',
    )
    expect(() =>
      postgresImageFromWorkflow(
        workflow.replace('      valkey:', `        image: ${image}\n      valkey:`),
      ),
    ).toThrow('Expected exactly one digest-pinned PostgreSQL 18 image')
    expect(() =>
      postgresImageFromWorkflow(`${workflow}  unrelated:\n    image: ${image}\n`),
    ).not.toThrow('Expected exactly one digest-pinned PostgreSQL 18 image')
    const decoy = `jobs:\n  unrelated:\n    services:\n      postgres:\n        image: ${image}\n  postgres-schema-tests:\n    services:\n      postgres:\n        image: postgres:18\n`
    expect(() => postgresImageFromWorkflow(decoy)).toThrow('Expected one postgres-schema-tests job')
    expect(() =>
      postgresImageFromWorkflow(
        `${workflow}  postgres-schema-tests:\n    services:\n      postgres:\n        image: ${image}\n`,
      ),
    ).toThrow('Expected one postgres-schema-tests job')
    const scalarDecoy = `name: |\n  postgres-schema-tests:\n    services:\n      postgres:\n        image: ${image}\njobs:\n  "postgres-schema-tests":\n    services:\n      postgres:\n        image: postgres:18\n`
    expect(() => postgresImageFromWorkflow(scalarDecoy)).toThrow(
      'Expected one postgres-schema-tests job',
    )
  })

  it('rejects unexpected files, links, and mismatched hashes before publication', async () => {
    const root = await fixtureRoot()
    try {
      const files = await describeGeneratedSnapshotFiles(root)
      const manifest = { formatVersion: 1 as const, ...identity, files }
      await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest))
      await expect(assertSnapshotManifest(root, manifest, identity)).resolves.toEqual([
        'markdown/README.md',
        'markdown/tables/posts.md',
        'schema.json',
      ])
      await expect(
        assertSnapshotManifest(root, manifest, { ...identity, headSha: base }),
      ).rejects.toThrow('Snapshot artifact headSha does not match request')
      await writeFile(join(root, 'markdown/tables/posts.md'), '# Tampered\n')
      await expect(assertSnapshotManifest(root, manifest, identity)).rejects.toThrow(
        /hash mismatch/,
      )
      await writeFile(join(root, 'markdown/tables/posts.md'), '# Posts\n')
      await symlink(join(root, 'schema.json'), join(root, 'markdown/shortcut.md'))
      await expect(assertSnapshotManifest(root, manifest, identity)).rejects.toThrow(
        /link or special/,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects candidate checkout symlinks in generated-file ancestors and leaves', async () => {
    const root = await fixtureRoot()
    const outside = await mkdtemp(join(tmpdir(), 'postgresql-snapshot-outside-'))
    try {
      await expect(
        assertSafeSnapshotDestination(root, 'markdown/tables/posts.md'),
      ).resolves.toBeUndefined()
      await symlink(outside, join(root, 'linked'))
      await expect(assertSafeSnapshotDestination(root, 'linked/posts.md')).rejects.toThrow(/Unsafe/)
      await symlink(join(root, 'schema.json'), join(root, 'markdown/linked.md'))
      await expect(assertSafeSnapshotDestination(root, 'markdown/linked.md')).rejects.toThrow(
        /Unsafe/,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})
