/** Session startup deadline for DB-backed Vitest processes; bounded transactions may override it. */
export const TEST_STATEMENT_TIMEOUT_MS =
  Number.parseInt(process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '', 10) || 20_000
