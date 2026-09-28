import { isGeneratedSnapshotPath } from './postgresql-snapshot-update-core.mts'

export const snapshotJsonPath = 'backend/data-stores/psql/schema-snapshot/schema.json'
export const snapshotMarkdownPath = 'docs/development/postgresql/schema-snapshot/markdown'

export function snapshotRepositoryPath(artifactPath: string): string {
  if (!isGeneratedSnapshotPath(artifactPath)) {
    throw new Error(`Unexpected snapshot artifact path: ${artifactPath}`)
  }
  return artifactPath === 'schema.json'
    ? snapshotJsonPath
    : `${snapshotMarkdownPath}/${artifactPath.slice('markdown/'.length)}`
}

export function snapshotArtifactPath(repositoryPath: string): string | null {
  if (repositoryPath === snapshotJsonPath) return 'schema.json'
  if (!repositoryPath.startsWith(`${snapshotMarkdownPath}/`)) return null
  const path = `markdown/${repositoryPath.slice(snapshotMarkdownPath.length + 1)}`
  return isGeneratedSnapshotPath(path) ? path : null
}
