/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the
   beforeEach hook must wrap every route test in the project, so it cannot be inside a describe. */
import { beforeEach } from 'vitest'
import {
  formatRecordedServerErrorResponses,
  takeRecordedServerErrorResponses,
} from './api/server-error-responses.mts'

// Print the server's 5xx body (message, code, stack) only when a test fails, so an unexpected 500
// is diagnosable from CI output while passing tests that expect 500s stay silent. onTestFailed runs
// after afterEach hooks, so the buffer is drained here rather than cleared in afterEach.
beforeEach(context => {
  takeRecordedServerErrorResponses()
  context.onTestFailed(() => {
    const responses = takeRecordedServerErrorResponses()
    if (responses.length > 0) console.error(formatRecordedServerErrorResponses(responses))
  })
})
