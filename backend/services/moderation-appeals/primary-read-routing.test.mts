import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

describe('moderation appeal primary-read routing', () => {
  it('keeps ordinary reads on replicas and mutation-critical reads on the primary', () => {
    const getSource = source('./get.mts')
    expect(getSource).toContain('return queryModerationAppealById(id, read)')
    expect(getSource).toContain('return queryModerationAppealById(id, write)')
    expect(getSource).toContain('await getModerationAppealByIdFromPrimary(id)')
  })

  it('uses primary reads for immediate delivery and rerun guards', () => {
    expect(source('./send-appeal-resolution.mts')).toContain(
      'await getModerationAppealByIdFromPrimary(appealId)',
    )
    expect(source('./rerun-resolution-draft.mts')).toContain(
      'await getModerationAppealByIdFromPrimary(appealId)',
    )
  })

  it('offers a staff-only primary detail read for rerun reconciliation', () => {
    const routeSource = source('../../api/v1/appeals/appeals.mts')
    expect(routeSource).toContain("isStaff && ctx.query.consistency === 'primary'")
    expect(routeSource).toContain('getModerationAppealByIdFromPrimary(id)')
  })

  it('uses a primary read before the appeal-resolution agent can bill a model call', () => {
    const agentSource = source('../../agents/appeal-resolution/run.mts')
    const primaryPreflightIndex = agentSource.indexOf(
      'await getModerationAppealByIdFromPrimary(appealId)',
    )
    const billedModelCallIndex = agentSource.indexOf('callRecordingAgentResponseUsage(')

    expect(primaryPreflightIndex).toBeGreaterThan(-1)
    expect(billedModelCallIndex).toBeGreaterThan(primaryPreflightIndex)
    expect(agentSource).not.toContain('await getModerationAppealById(appealId)')
  })
})
