import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestPlan, TestsPlanDocumentOptions, TestsPlanOptions } from 'no-mistakes'

const noMistakes = vi.hoisted(() => ({
  testsComment: vi.fn<(options: TestsPlanDocumentOptions) => Promise<string>>(),
  testsPlan: vi.fn<(options: TestsPlanOptions) => Promise<TestPlan>>(),
}))

vi.mock(import('no-mistakes'), () => ({
  ...noMistakes,
  default: noMistakes as unknown as typeof import('no-mistakes'),
}))

import { planTests } from './test-plan.mts'

function createTestPlan(testFiles: string[]): TestPlan {
  return {
    changedFiles: ['renamed-old.mts', 'renamed-new.mts'],
    fallbackReason: null,
    fallbackTriggered: false,
    groups: [],
    selectedTests: testFiles.map(testFile => ({
      confidence: 'high',
      reasons: [],
      testFile,
    })),
    warnings: [],
  }
}

describe('test plan adapter', () => {
  beforeEach(() => {
    noMistakes.testsPlan.mockReset()
    noMistakes.testsComment.mockReset()
    noMistakes.testsComment.mockResolvedValue('')
  })

  it('maps a cargo runner target from testsPlan through to PlannedTestTarget', async () => {
    noMistakes.testsPlan.mockResolvedValue({
      changedFiles: ['rust/packages/html/src/lib.rs'],
      fallbackReason: null,
      fallbackTriggered: false,
      groups: [],
      selectedTests: [
        {
          confidence: 'high',
          reasons: [],
          targets: [
            {
              baseCommand: ['cargo', 'test'],
              runner: 'cargo',
              runnerArgs: ['--package', 'html'],
            },
          ],
          testFile: 'rust/packages/html/src/lib.rs',
        },
      ],
      executionTargets: [
        {
          baseCommand: ['cargo', 'test'],
          runner: 'cargo',
          runnerArgs: ['--package', 'html'],
          testFiles: ['rust/packages/html/src/lib.rs'],
        },
      ],
      warnings: [],
    })

    const plan = await planTests({
      changedFiles: ['rust/packages/html/src/lib.rs'],
      environment: 'prePush',
      framework: 'cargo',
      worktreeRoot: '/repo',
    })

    expect(plan.targets).toEqual([
      {
        baseCommand: ['cargo', 'test'],
        config: null,
        project: null,
        runner: 'cargo',
        runnerArgs: ['--package', 'html'],
        testFiles: ['rust/packages/html/src/lib.rs'],
      },
    ])
  })

  it('emits only runnable Playwright spec files', async () => {
    noMistakes.testsPlan.mockResolvedValue(
      createTestPlan([
        'ci/playwright/ci-select.test.mts',
        'playwright/helpers/__tests__/auth.mock.test.mts',
        'playwright/setup/auth.setup.mts',
        'playwright/tests/feed/feed.spec.mts',
      ]),
    )

    const plan = await planTests({
      changedFiles: ['ci/playwright/ci-select.mts'],
      environment: 'pullRequest',
      framework: 'playwright',
      worktreeRoot: '/repo',
    })

    expect(plan.files).toEqual(['playwright/tests/feed/feed.spec.mts'])
  })

  it('does not filter Vitest files', async () => {
    noMistakes.testsPlan.mockResolvedValue(
      createTestPlan([
        'ci/playwright/ci-select.test.mts',
        'backend/services/users/create.test.mts',
      ]),
    )

    const plan = await planTests({
      changedFiles: ['backend/services/users/create.mts'],
      environment: 'prePush',
      framework: 'vitest',
      worktreeRoot: '/repo',
    })

    expect(plan.files).toEqual([
      'ci/playwright/ci-select.test.mts',
      'backend/services/users/create.test.mts',
    ])
    expect(plan.changedFiles).toEqual(['renamed-old.mts', 'renamed-new.mts'])
    expect(noMistakes.testsPlan).toHaveBeenCalledTimes(1)
  })

  it('forwards base and head to testsPlan for targeted lockfile analysis', async () => {
    noMistakes.testsPlan.mockResolvedValue(createTestPlan([]))

    await planTests({
      base: 'abc123',
      changedFiles: ['pnpm-lock.yaml'],
      environment: 'pullRequest',
      framework: 'playwright',
      head: 'HEAD',
      worktreeRoot: '/repo',
    })

    expect(noMistakes.testsPlan).toHaveBeenCalledWith(
      expect.objectContaining({ base: 'abc123', head: 'HEAD' }),
    )
  })

  it('forwards execution and lock deadlines to every no-mistakes invocation', async () => {
    noMistakes.testsPlan.mockResolvedValue(createTestPlan([]))

    await planTests({
      changedFiles: ['web/app/page.tsx'],
      environment: 'pullRequest',
      framework: 'vitest',
      lockTimeout: 0,
      timeout: 0,
      worktreeRoot: '/repo',
    })

    expect(noMistakes.testsPlan).toHaveBeenCalledWith(
      expect.objectContaining({ includeComment: true, lockTimeout: 0, timeout: 0 }),
    )
    expect(noMistakes.testsComment).not.toHaveBeenCalled()
  })
})
