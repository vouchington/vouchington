import { isDeepStrictEqual } from 'node:util'

import { parseFrontMatter } from './agent-policy/front-matter.mts'
import { validateRetroDoc } from './retrospective-validate.mts'

// vouchington-tooling policy module, contract v1 (declared in package.json under
// "vouchington-tooling.policy"). The tooling server runs this in a fresh child node
// process per call with no blackboard token, so it must stay pure: no network, no env.

export type RetrospectivePolicyInput = {
  sessionId: string
  parentSessionId: string | null
  mode: 'interactive' | 'autonomous'
  workOutcome: string
  feedbackCoverage: { status: string; sources: string[]; droppedCount: number }
  repositories: string[]
  markdown: string
  sourceEventId: string
}

export type PolicyResult = { errors: string[]; warnings?: string[] }

// Vouchington retrospective rules: required sections, CI failure grammar, tool and
// architecture assessments (validateRetroDoc), then front-matter shape and its
// consistency with the request. Envelope building and delivery belong to tooling.
export function validateRetrospective(input: RetrospectivePolicyInput): PolicyResult {
  const errors = [...validateRetroDoc(input.markdown).errors]
  try {
    const front = parseFrontMatter(input.markdown)
    if (front.sessionId !== undefined && front.sessionId !== input.sessionId)
      errors.push(
        `retrospective doc session_id ${front.sessionId} does not match resolved session ${input.sessionId}`,
      )
    if (front.feedbackMetadata) {
      if (front.feedbackMetadata.workOutcome !== input.workOutcome)
        errors.push('front matter work_outcome conflicts with the requested work outcome')
      if (!isDeepStrictEqual(front.feedbackMetadata.feedbackCoverage, input.feedbackCoverage))
        errors.push('front matter feedback_coverage conflicts with the requested coverage')
    }
    if (
      front.repositories !== undefined &&
      !isDeepStrictEqual(front.repositories, input.repositories)
    )
      errors.push('front matter repositories conflict with the requested repositories')
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }
  if (
    input.feedbackCoverage.status === 'complete' &&
    (/^Status: (?:unavailable|not assessed|partial)/m.test(input.markdown) ||
      !input.markdown.includes('## Tool Findings') ||
      !input.markdown.includes('## Architecture Findings'))
  )
    errors.push(
      'complete feedback coverage requires available assessed factual, tool, and architecture sources',
    )
  return { errors }
}

// Phase 3 owns validatePullRequest and the PR defaults. Until then this carries only the
// default repositories, which tooling also uses as the retrospective default.
export function pullRequestDefaults(): { repositories: string[] } {
  return { repositories: ['vouchington/vouchington'] }
}
