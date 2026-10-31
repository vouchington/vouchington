import { describe, expect, it } from 'vitest'

import {
  agentWorkflowDocViolations,
  hasPrShepherdDeadlineRegression,
} from './agent-workflow-doc-policy.mts'

describe('agent workflow documentation', () => {
  it('scopes pr-shepherd session deadline wording to pr-shepherd docs', () => {
    expect(
      hasPrShepherdDeadlineRegression(
        "The one-hour freshness TTL mirrors oauth-google's JWKS cache.",
      ),
    ).toBe(false)
    expect(
      hasPrShepherdDeadlineRegression(
        'Run pr-shepherd until a one-hour session deadline, then stop.',
      ),
    ).toBe(true)
  })

  it('rejects deadline and separator regressions in finite Markdown inputs', () => {
    const files = new Map([
      ['web/AGENTS.md', 'Use pr-shepherd until its terminal action.'],
      [
        'docs/agent.md',
        'Run pr-shepherd until a one-hour session deadline.\n\nRun pr:attach-screenshots -- --check-upload-credentials.',
      ],
    ])
    expect(agentWorkflowDocViolations([...files.keys()], path => files.get(path)!)).toEqual([
      'docs/agent.md:paragraph-1: pr-shepherd session deadline',
      'docs/agent.md: pnpm separator for screenshot CLI',
    ])
    expect(agentWorkflowDocViolations(['docs/agent.md'], path => files.get(path)!)).toContain(
      'web/AGENTS.md is missing from tracked Markdown',
    )
  })
})
