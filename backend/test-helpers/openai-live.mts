import type { TestContext } from 'vitest'
import { describeOpenAIUpstreamFailure, type OpenAIUpstreamFailure } from '@modules/openai-utils'

/**
 * Wraps the body of a live-OpenAI integration test so a provider outage skips instead of failing.
 *
 * These tests assert what *our* code does when OpenAI answers. When OpenAI does not answer there is
 * nothing of ours left to assert, so failing reports a defect that does not exist — and because
 * `test-backend-credentialed` feeds the required `tests` check, a provider blip blocks merges on
 * PRs that cannot have caused it and turns `main` red, where it is indistinguishable from a genuine
 * breakage.
 *
 * Only the signatures `describeOpenAIUpstreamFailure` recognises are tolerated. A retired model, a
 * rejected key, a changed response shape, an exceeded timeout budget and every failed assertion
 * still fail the test, so the check keeps proving what it was added to prove.
 */
export function liveOpenAITest(body: () => Promise<void>): (context: TestContext) => Promise<void> {
  return async context => {
    try {
      await body()
    } catch (error) {
      const upstream = describeOpenAIUpstreamFailure(error)
      if (upstream === null) throw error
      const note = formatOpenAIUpstreamSkip(upstream)
      // Logged as well as attached to the skip: one skipped test is easy to miss in a 50-test
      // summary, and the status and request id are what make a recurrence attributable to OpenAI.
      console.warn(note)
      context.skip(note)
    }
  }
}

function formatOpenAIUpstreamSkip(failure: OpenAIUpstreamFailure): string {
  const details = [
    failure.status === undefined ? null : `status=${failure.status}`,
    failure.requestId === undefined ? null : `request_id=${failure.requestId}`,
    failure.code === undefined ? null : `code=${failure.code}`,
  ].filter(detail => detail !== null)
  const suffix = details.length > 0 ? ` (${details.join(', ')})` : ''
  return `OpenAI was unavailable — ${failure.reason}${suffix}`
}
