// One run reports every failing scenario. Stopping at the first error hid later failures until
// each fix reached CI, so a fix PR could pass its own scenario and fail on the next (#3410).
export interface ScenarioFailure {
  scenario: string
  error: unknown
}

const failures: ScenarioFailure[] = []

export async function continueAfterFailure(
  scenario: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn()
  } catch (err) {
    failures.push({ scenario, error: err })
    console.error(`FAILED: ${scenario}`)
    console.error(err)
  }
}

// Wraps a capture whose first argument names its scenario.
export function continuingAfterFailure<Args extends [string, ...unknown[]]>(
  fn: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  return (...args) => continueAfterFailure(args[0], () => fn(...args))
}

export function getScenarioFailures(): readonly ScenarioFailure[] {
  return failures
}

export function resetScenarioFailures(): void {
  failures.length = 0
}

// Run-level checks such as the manifest still run after scenario failures; their errors join the
// same report so one exit names everything that went wrong.
export function assertNoScenarioFailures(runErrors: readonly unknown[] = []): void {
  if (failures.length === 0 && runErrors.length === 0) return
  const names = failures.map(failure => failure.scenario)
  throw new AggregateError(
    [...failures.map(failure => failure.error), ...runErrors],
    `${failures.length} EXPLAIN scenario failure(s) [${names.join(', ')}] and ` +
      `${runErrors.length} run check failure(s)`,
  )
}
