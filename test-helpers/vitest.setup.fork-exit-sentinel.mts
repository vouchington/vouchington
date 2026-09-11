/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   beforeEach/afterEach hooks must observe every test in the project's fork to track which module
   and project the fork was executing when it died, so they cannot be wrapped in a describe block. */
import { afterEach, beforeAll, beforeEach } from 'vitest'
import {
  injectForkCrash,
  requestedForkCrashInjectMode,
} from './vitest-fork-exit-crash-injector.mts'
import {
  registerForkExitSentinel,
  setCurrentForkExitModule,
  setCurrentForkExitProject,
} from './vitest-fork-exit-sentinel.mts'

registerForkExitSentinel()

beforeEach(context => {
  setCurrentForkExitModule(context.task.file.filepath)
  setCurrentForkExitProject(context.task.file.projectName)
})

afterEach(() => {
  setCurrentForkExitModule(null)
})

// VITEST_FORK_CRASH_INJECT is honored only against an exact allowlist (oom | abort | sigkill |
// throw | reject) and is inert for any other value including unset — mirrors the
// VITEST_FORK_LEAK_DETECTION === 'off' precedent in vitest.setup.fork-leak-detection.mts. Only
// vitest-fork-exit-sentinel.integration.test.mts's fixture project ever sets this.
const crashMode = requestedForkCrashInjectMode()
if (crashMode) {
  beforeAll(() => {
    injectForkCrash(crashMode)
  })
}
