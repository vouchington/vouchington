import { describe, expect, it } from 'vitest'
import {
  snapshotArtifactPath,
  snapshotMarkdownPath,
  snapshotRepositoryPath,
} from './postgresql-snapshot-paths.mts'

describe('snapshot artifact destinations', () => {
  it.each([
    ['schema.json', 'backend/data-stores/psql/schema-snapshot/schema.json'],
    ['markdown/README.md', 'docs/development/postgresql/schema-snapshot/markdown/README.md'],
    [
      'markdown/tables/widgets.md',
      'docs/development/postgresql/schema-snapshot/markdown/tables/widgets.md',
    ],
  ])('maps the unchanged artifact path %s to its repository owner', (artifactPath, expected) => {
    const destination = snapshotRepositoryPath(artifactPath)
    expect(destination).toBe(expected)
    expect(snapshotArtifactPath(destination)).toBe(artifactPath)
  })

  it.each(['../schema.json', 'markdown/../escape.md', 'markdown/tables/file.sql', '/schema.json'])(
    'rejects an artifact path outside the existing whitelist: %s',
    path => expect(() => snapshotRepositoryPath(path)).toThrow('Unexpected snapshot artifact path'),
  )

  it.each([
    'backend/data-stores/psql/schema-snapshot/generate.mts',
    'backend/data-stores/psql/schema-snapshot/markdown/README.md',
    'docs/development/postgresql/schema-snapshot/README.md',
    `${snapshotMarkdownPath}-other/README.md`,
    `${snapshotMarkdownPath}/tables/file.sql`,
    `${snapshotMarkdownPath}/../escape.md`,
  ])('rejects repository paths outside the two generated destinations: %s', path => {
    expect(snapshotArtifactPath(path)).toBeNull()
  })
})
