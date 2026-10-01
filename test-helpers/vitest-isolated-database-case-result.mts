import {
  getIsolatedDatabaseCase,
  type IsolatedDatabaseCaseId,
} from './vitest-isolated-database-cases.mts'

export type IsolatedDatabaseCaseTestResult = { fullName: string; state: string }

const resultMarker = '[isolated-database-case-result]'

/** One stdout line the child reporter prints after the run, carrying every collected test. */
export function formatIsolatedDatabaseCaseResult(tests: IsolatedDatabaseCaseTestResult[]): string {
  return `${resultMarker} ${JSON.stringify(tests)}\n`
}

/**
 * Exit code 0 is not proof the registered test ran: Vitest exits 0 when `testNamePattern` selects
 * nothing and reports the test as skipped. Require exactly one passing test with the registered
 * full name, and no failures, in the child's reported results.
 */
export function assertIsolatedDatabaseCaseRan(caseId: IsolatedDatabaseCaseId, output: string) {
  const { fullName } = getIsolatedDatabaseCase(caseId)
  const tests = parseResult(output)
  if (!tests) {
    throw new Error(`Isolated database case ${caseId} child did not report its test results`)
  }
  const passed = tests.filter(test => test.state === 'passed')
  const failed = tests.filter(test => test.state === 'failed')
  if (passed.length === 1 && passed[0]?.fullName === fullName && failed.length === 0) return
  const collected = tests.map(test => `\n  ${test.state}: ${test.fullName}`).join('')
  const counts = `${passed.length} passed, ${failed.length} failed, ${tests.length} collected`
  throw new Error(
    `Isolated database case ${caseId} must pass exactly one test named "${fullName}" but ${counts}${collected && ':'}${collected}`,
  )
}

function parseResult(output: string): IsolatedDatabaseCaseTestResult[] | undefined {
  const line = output.split('\n').findLast(candidate => candidate.startsWith(`${resultMarker} `))
  if (!line) return undefined
  return JSON.parse(line.slice(resultMarker.length + 1)) as IsolatedDatabaseCaseTestResult[]
}
