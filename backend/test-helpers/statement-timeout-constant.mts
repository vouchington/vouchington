/** Leave attribution and rollback headroom inside the five-second test deadline. */
export const MAX_TEST_STATEMENT_TIMEOUT_MS = 2_000
/** Shared notice observers require a full second; smaller operation-local bounds stay separate. */
export const MIN_TEST_STATEMENT_TIMEOUT_MS = 1_000

export function parseTestStatementTimeout(raw: string | undefined): number {
  if (raw === undefined) return MAX_TEST_STATEMENT_TIMEOUT_MS
  const value = Number(raw)
  if (
    !/^[1-9]\d*$/u.test(raw) ||
    !Number.isSafeInteger(value) ||
    value < MIN_TEST_STATEMENT_TIMEOUT_MS ||
    value > MAX_TEST_STATEMENT_TIMEOUT_MS
  )
    throw new RangeError(
      `PG_TEST_STATEMENT_TIMEOUT_MS must be an integer from ${MIN_TEST_STATEMENT_TIMEOUT_MS} to ${MAX_TEST_STATEMENT_TIMEOUT_MS}`,
    )
  return value
}

/** Session startup deadline; explicit production bounded transactions retain their own budgets. */
export const TEST_STATEMENT_TIMEOUT_MS = parseTestStatementTimeout(
  process.env.PG_TEST_STATEMENT_TIMEOUT_MS,
)
