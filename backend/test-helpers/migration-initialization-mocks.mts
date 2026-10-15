import { vi } from 'vitest'

export const migrationInitializers = {
  parser: vi.fn<typeof import('@vouchington/postgres').loadSqlParserModule>(),
  ast: vi.fn<typeof import('vouchington-tooling/sql-ast').initSqlAst>(),
}

/** Preload and test registration must return these same functions, never a second mock identity. */
export async function mockMigrationPostgres(
  original: () => Promise<typeof import('@vouchington/postgres')>,
): Promise<typeof import('@vouchington/postgres')> {
  const actual = await original()
  migrationInitializers.parser.mockImplementation(actual.loadSqlParserModule)
  return { ...actual, loadSqlParserModule: migrationInitializers.parser }
}

export async function mockMigrationSqlAst(
  original: () => Promise<typeof import('vouchington-tooling/sql-ast')>,
): Promise<typeof import('vouchington-tooling/sql-ast')> {
  const actual = await original()
  migrationInitializers.ast.mockImplementation(actual.initSqlAst)
  return { ...actual, initSqlAst: migrationInitializers.ast }
}
