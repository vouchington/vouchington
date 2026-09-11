import { describe, expect, it } from 'vitest'
import { MODERATION_REPORT_REASONS } from '@ts-shared/utils/moderation-reports'
import {
  REPORT_REASON_CONTENT_POLICY_COVERAGE,
  renderReportReasonPolicyCoverageForPrompt,
} from '../content-policy.mts'

describe('moderation content policy', () => {
  it('covers every moderation report reason used by report judgement prompts', () => {
    expect(Object.keys(REPORT_REASON_CONTENT_POLICY_COVERAGE)).toEqual(MODERATION_REPORT_REASONS)
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
