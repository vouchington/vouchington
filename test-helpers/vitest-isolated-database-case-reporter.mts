import type { Reporter } from 'vitest/node'
import { formatIsolatedDatabaseCaseResult } from './vitest-isolated-database-case-result.mts'

/** Reports each collected test's Vitest full name and final state for the parent to verify. */
export class IsolatedDatabaseCaseReporter implements Reporter {
  onTestRunEnd: NonNullable<Reporter['onTestRunEnd']> = testModules => {
    const tests = testModules.flatMap(testModule =>
      [...testModule.children.allTests()].map(testCase => ({
        fullName: testCase.fullName,
        state: testCase.result().state,
      })),
    )
    process.stdout.write(formatIsolatedDatabaseCaseResult(tests))
  }
}
