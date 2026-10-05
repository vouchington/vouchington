import { isGeneratedSnapshotPath } from './postgresql-snapshot-update-core.mts'

export const snapshotJsonPath = 'backend/data-stores/psql/schema-snapshot/schema.json'
export const snapshotCatalogPath =
  'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json'
export const snapshotMarkdownPath = 'docs/development/postgresql/schema-snapshot/markdown'

export function snapshotRepositoryPath(artifactPath: string): string {
  if (!isGeneratedSnapshotPath(artifactPath)) {
    throw new Error(`Unexpected snapshot artifact path: ${artifactPath}`)
  }
  if (artifactPath === 'schema.json') return snapshotJsonPath
  if (artifactPath === 'no-mistakes-catalog.json') return snapshotCatalogPath
  return `${snapshotMarkdownPath}/${artifactPath.slice('markdown/'.length)}`
}

export function snapshotArtifactPath(repositoryPath: string): string | null {
  if (repositoryPath === snapshotJsonPath) return 'schema.json'
  if (repositoryPath === snapshotCatalogPath) return 'no-mistakes-catalog.json'
  if (!repositoryPath.startsWith(`${snapshotMarkdownPath}/`)) return null
  const path = `markdown/${repositoryPath.slice(snapshotMarkdownPath.length + 1)}`
  return isGeneratedSnapshotPath(path) ? path : null
}
