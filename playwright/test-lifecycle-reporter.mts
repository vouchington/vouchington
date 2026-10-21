import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'
import { relative } from 'node:path'

type LifecycleTest = Pick<TestCase, 'id' | 'location'> & {
  parent: {
    project(): Pick<NonNullable<ReturnType<TestCase['parent']['project']>>, 'name'> | undefined
  }
}
type LifecycleResult = Pick<
  TestResult,
  'retry' | 'workerIndex' | 'parallelIndex' | 'status' | 'duration'
>

export default class TestLifecycleReporter implements Reporter {
  static readonly modulePath = import.meta.filename

  private skippedResults = 0
  private rootDir = ''
  private shard: FullConfig['shard'] = null

  onBegin(config: Pick<FullConfig, 'rootDir' | 'shard'>): void {
    this.skippedResults = 0
    this.rootDir = config.rootDir
    this.shard = config.shard
  }

  onTestBegin(test: LifecycleTest, result: LifecycleResult): void {
    this.record('begin', test, result)
  }

  onTestEnd(test: LifecycleTest, result: LifecycleResult): void {
    if (result.status === 'skipped') this.skippedResults += 1
    this.record('end', test, result)
  }

  async onEnd(result: Pick<FullResult, 'status'>): Promise<{ status: 'failed' } | undefined> {
    // Fail the CI run without rewriting actual case results or masking an earlier failure.
    // Step skips never produce a skipped whole-test result.
    if (result.status === 'passed' && this.skippedResults > 0) {
      try {
        process.stderr.write(
          `Whole-test skips are forbidden in CI: ${this.skippedResults} skipped results. Inspect lifecycle logs and JUnit results.\n`,
        )
      } catch {
        // Playwright swallows reporter errors; diagnostic I/O must not erase the failed override.
      }
      return { status: 'failed' }
    }
    return undefined
  }

  printsToStdio(): boolean {
    return true
  }

  private record(event: 'begin' | 'end', test: LifecycleTest, result: LifecycleResult): void {
    process.stdout.write(
      `${JSON.stringify({
        marker: 'playwright-test-lifecycle',
        event,
        observedAt: new Date().toISOString(),
        testId: test.id,
        file: relative(this.rootDir, test.location.file),
        line: test.location.line,
        project: test.parent.project()?.name,
        shard: this.shard,
        retry: result.retry,
        workerIndex: result.workerIndex,
        parallelIndex: result.parallelIndex,
        ...(event === 'end' ? { status: result.status, durationMs: result.duration } : {}),
      })}\n`,
    )
  }
}
