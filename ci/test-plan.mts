import { testsPlan, type TestExecutionTarget, type TestPlan } from 'no-mistakes'

export type TestPlanFramework = TestExecutionTarget['runner']

export interface PlannedTestTarget {
  runner: TestPlanFramework
  config: string | null
  project: string | null
  baseCommand: string[]
  runnerArgs: string[]
  testFiles: string[]
  displayName?: string
}

export interface PlannedTests {
  changedFiles: string[]
  files: string[]
  targets: PlannedTestTarget[]
  total: number
  threshold: number
  warnings: string[]
  fallbackTriggered: boolean
  fallbackReason: string | null
  groups: NonNullable<TestPlan['groups']>
  json: TestPlan
  comment: string
}

export function isRunnablePlaywrightSpec(file: string): boolean {
  return file.startsWith('playwright/tests/') && file.endsWith('.spec.mts')
}

export async function planTests(options: {
  framework: TestPlanFramework
  /** Full unified diff content. When provided, changedFiles is ignored. */
  diff?: string
  /** File path list used when diff is not provided. */
  changedFiles?: string[]
  worktreeRoot: string
  environment: string
  limitPercent?: number
  limitFiles?: number
  /** Keep only tests matching these repository-relative globs before plan accounting. */
  includeGlob?: string[]
  /**
   * Base git ref (e.g. merge-base SHA) for targeted lockfile analysis.
   * Required alongside `head` to enable per-package lockfile tracing;
   * without it, lockfile changes fall back to the full suite.
   */
  base?: string
  /** Head git ref (e.g. 'HEAD') for targeted lockfile analysis. */
  head?: string
  /**
   * Command execution timeout in seconds, forwarded to no-mistakes'
   * `testsPlan()`. Omit or pass null to disable the library deadline.
   */
  timeout?: number | null
  /**
   * Machine-wide invocation lock wait timeout in seconds, forwarded to
   * no-mistakes' `testsPlan()`.
   */
  lockTimeout?: number | null
  /**
   * Optional explicit tsconfig. Omit this to let no-mistakes resolve the
   * applicable workspace config for each traversed file.
   */
  tsconfig?: string
}): Promise<PlannedTests> {
  const plan = await testsPlan({
    framework: options.framework,
    root: options.worktreeRoot,
    ...(options.tsconfig === undefined ? {} : { tsconfig: options.tsconfig }),
    diff: options.diff || undefined,
    changedFiles: options.diff ? undefined : options.changedFiles,
    environment: options.environment,
    limitPercent: options.limitPercent,
    limitFiles: options.limitFiles,
    includeGlob: options.includeGlob,
    base: options.base,
    head: options.head,
    timeout: options.timeout,
    lockTimeout: options.lockTimeout,
    includeComment: true,
  })

  const groups = plan.groups ?? []
  const selected = plan.selectedTests.reduce<string[]>((tests, test) => {
    if (options.framework !== 'playwright' || isRunnablePlaywrightSpec(test.testFile)) {
      tests.push(test.testFile)
    }
    return tests
  }, [])
  const selectedSet = new Set(selected)
  const targets = (plan.executionTargets ?? []).flatMap(target => {
    const testFiles = target.testFiles.filter(test => selectedSet.has(test))
    if (testFiles.length === 0) return []
    return [
      {
        runner: target.runner,
        config: target.config ?? null,
        project: target.project ?? null,
        baseCommand: target.baseCommand,
        runnerArgs: target.runnerArgs,
        testFiles,
        ...(target.name == null ? {} : { displayName: target.name }),
      },
    ]
  })

  const total =
    groups.length === 0
      ? selected.length
      : Math.max(selected.length, ...groups.map(group => group.remaining + group.selected.length))
  const threshold =
    groups.length === 0
      ? selected.length
      : groups.reduce((sum, group) => sum + (group.limit ?? group.selected.length), 0)

  return {
    changedFiles: plan.changedFiles,
    files: selected,
    targets,
    total,
    threshold,
    warnings: plan.warnings.map(warning => `${warning.type}: ${warning.message}`),
    fallbackTriggered: plan.fallbackTriggered,
    fallbackReason: plan.fallbackReason ?? null,
    groups,
    json: plan,
    comment: (plan.comment ?? '').trim(),
  }
}
