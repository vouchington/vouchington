import { vi } from 'vitest'

// Register before app/worker setup binds migration-runner reexports. All startup calls remain real.
vi.mock<typeof import('@vouchington/postgres')>(import('@vouchington/postgres'), async original => {
  const { mockMigrationPostgres } =
    await import('@voucha/test-helpers/migration-initialization-mocks')
  return mockMigrationPostgres(original)
})
vi.mock<typeof import('vouchington-tooling/sql-ast')>(
  import('vouchington-tooling/sql-ast'),
  async original => {
    const { mockMigrationSqlAst } =
      await import('@voucha/test-helpers/migration-initialization-mocks')
    return mockMigrationSqlAst(original)
  },
)
