import { describe, expect, it } from 'vitest'
import { MODERATION_REPORT_REASONS } from '@ts-shared/utils/moderation-reports'
import { renderReportReasonPolicyCoverageForPrompt } from '../content-policy.mts'

describe('moderation content policy', () => {
  it('covers every moderation report reason used by report judgement prompts', () => {
    const prompt = renderReportReasonPolicyCoverageForPrompt()
    const reasons = prompt.split('\n').map(line => {
      const match = /^\d+\. \*\*([^*]+)\*\*/.exec(line)
      if (!match?.[1]) throw new Error(`Report reason prompt line has no reason: ${line}`)
      return match[1]
    })
    expect(reasons).toEqual(MODERATION_REPORT_REASONS)
  })

  it('renders explicit guidance for non-category report reasons', () => {
    const prompt = renderReportReasonPolicyCoverageForPrompt()

    expect(prompt).toContain('**spam**: evaluate against spam')
    expect(prompt).toContain('**vote_manipulation**')
    expect(prompt).toContain('coordinated, deceptive, or manipulative')
    expect(prompt).toContain('**other**')
    expect(prompt).toContain('Catch-all report reason')
  })
})
