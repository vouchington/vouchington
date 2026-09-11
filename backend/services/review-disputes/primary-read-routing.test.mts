import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

describe('review dispute primary-read routing', () => {
  it('uses the primary for immediate delivery preconditions', () => {
    expect(source('./send-dispute-resolution.mts')).toContain(
      'await getReviewDisputeByIdFromPrimary(disputeId)',
    )
  })
})
