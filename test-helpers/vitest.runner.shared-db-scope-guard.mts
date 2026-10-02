import { TestRunner } from 'vitest'
import {
  markSharedDbScopeViolationsReported,
  unreportedSharedDbScopeViolations,
} from './vitest-shared-db-scope-violations.mts'

export default class SharedDbScopeGuardRunner extends TestRunner {
  override async importFile(
    filepath: string,
    source: Parameters<TestRunner['importFile']>[1],
  ): Promise<void> {
    try {
      await super.importFile(filepath, source)
    } catch (err) {
      const violations = unreportedSharedDbScopeViolations(filepath)
      markSharedDbScopeViolationsReported(filepath)
      if (violations.length === 0) throw err
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\n\n${violations.map(violation => violation.message).join('\n')}`,
        { cause: err },
      )
    }
  }

  override async onBeforeRunSuite(suite: Parameters<TestRunner['onBeforeRunSuite']>[0]) {
    await super.onBeforeRunSuite(suite)
    if (suite.result?.state === 'fail') this.#reportFileViolations(suite)
  }

  override async onAfterRunSuite(suite: Parameters<TestRunner['onAfterRunSuite']>[0]) {
    await super.onAfterRunSuite(suite)
    this.#reportFileViolations(suite)
  }

  #reportFileViolations(suite: Parameters<TestRunner['onAfterRunSuite']>[0]): void {
    if (!('filepath' in suite) || typeof suite.filepath !== 'string') return
    const violations = unreportedSharedDbScopeViolations(suite.filepath)
    markSharedDbScopeViolationsReported(suite.filepath)
    if (violations.length === 0) return

    const result = suite.result
    if (!result) throw new Error(violations.map(violation => violation.message).join('\n'))
    if (!result.errors) result.errors = []
    result.errors.push({
      name: 'SharedDbScopeViolation',
      message: violations.map(violation => violation.message).join('\n'),
    })
    result.state = 'fail'
  }
}
