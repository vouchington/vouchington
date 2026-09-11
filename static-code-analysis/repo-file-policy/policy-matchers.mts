export function isMigrationSqlFile(file: string): boolean {
  return file.startsWith('backend/data-stores/psql/migrations/') && file.endsWith('.sql')
}

/** Path boundary for source files the schema/doc drift scan reads for content. */
export function isSchemaDocDriftSourcePath(file: string): boolean {
  if (!/\.(?:[cm]?ts|tsx|[cm]?js|sql)$/.test(file)) return false
  return (
    file.startsWith('backend/') ||
    file.startsWith('integration-tests/') ||
    file.startsWith('playwright/') ||
    file.startsWith('web/')
  )
}
