/* No mocks — pure utility functions */
import { describe, it, expect } from 'vitest'
import {
  truncateUrl,
  isActive,
  groupByProgram,
  isChildLink,
  getUnfurlStatus,
} from '../referral-links-manager-utils'
import type { UserReferralLinkWithDetails } from '@/types/api-responses'

function makeLink(overrides?: Partial<UserReferralLinkWithDetails>): UserReferralLinkWithDetails {
  return {
    id: 'link-1',
    user_id: 'user-1',
    referral_program_id: 'rp-1',
    url_id: 'url-1',
    url: 'https://example.com/ref/abc',
    label: 'My link',
    activated_at: '2024-01-01T00:00:00Z',
    deactivated_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    referral_program_name: 'Example Program',
    referral_program_slug: 'example-program',
    parent_link_id: null,
    unfurl_requested_at: null,
    unfurl_completed_at: null,
    unfurl_failed_at: null,
    unfurl_last_error: null,
    ...overrides,
  }
}

describe('truncateUrl', () => {
  it('returns hostname+path for normal URL under maxLen', () => {
    const result = truncateUrl('https://bank.com/ref/you')
    expect(result).toBe('bank.com/ref/you')
  })

  it('truncates with ellipsis when URL is over default maxLen (60)', () => {
    const longUrl = `https://bank.com/ref/${'a'.repeat(60)}`
    const result = truncateUrl(longUrl)
    expect(result.endsWith('…')).toBe(true)
    // The displayed part (before ellipsis) should be exactly 60 chars
    expect(result.slice(0, 60)).toHaveLength(60)
    expect(result).toHaveLength(61)
  })

  it('falls back to raw string for invalid URL (no protocol)', () => {
    const raw = 'not-a-valid-url'
    expect(truncateUrl(raw)).toBe(raw)
  })

  it('truncates raw string fallback when over maxLen', () => {
    const raw = 'x'.repeat(70)
    const result = truncateUrl(raw)
    expect(result).toBe(`${'x'.repeat(60)}…`)
  })

  it('respects custom maxLen param', () => {
    const result = truncateUrl('https://bank.com/ref/you', 10)
    expect(result.endsWith('…')).toBe(true)
    expect(result).toHaveLength(11)
  })
})

describe('isActive', () => {
  it('returns true when activated_at is non-null and deactivated_at is null', () => {
    expect(isActive(makeLink({ activated_at: '2024-01-01T00:00:00Z', deactivated_at: null }))).toBe(
      true,
    )
  })

  it('returns false when deactivated_at is non-null', () => {
    expect(
      isActive(
        makeLink({
          activated_at: '2024-01-01T00:00:00Z',
          deactivated_at: '2024-06-01T00:00:00Z',
        }),
      ),
    ).toBe(false)
  })

  it('returns false when activated_at is null', () => {
    expect(isActive(makeLink({ activated_at: null, deactivated_at: null }))).toBe(false)
  })
})

describe('groupByProgram', () => {
  it('returns empty array for empty input', () => {
    expect(groupByProgram([])).toEqual([])
  })

  it('groups multiple links with the same program together', () => {
    const links = [
      makeLink({ id: 'link-1', referral_program_id: 'rp-1', referral_program_name: 'Alpha' }),
      makeLink({ id: 'link-2', referral_program_id: 'rp-1', referral_program_name: 'Alpha' }),
    ]
    const groups = groupByProgram(links)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.programId).toBe('rp-1')
    expect(groups[0]!.links).toHaveLength(2)
  })

  it('sorts groups alphabetically by programName', () => {
    const links = [
      makeLink({ id: 'link-1', referral_program_id: 'rp-z', referral_program_name: 'Zeta Bank' }),
      makeLink({ id: 'link-2', referral_program_id: 'rp-a', referral_program_name: 'Alpha Bank' }),
      makeLink({ id: 'link-3', referral_program_id: 'rp-m', referral_program_name: 'Metro Bank' }),
    ]
    const groups = groupByProgram(links)
    expect(groups.map(g => g.programName)).toEqual(['Alpha Bank', 'Metro Bank', 'Zeta Bank'])
  })

  it('preserves all links in each group', () => {
    const links = [
      makeLink({ id: 'link-1', referral_program_id: 'rp-a', referral_program_name: 'Alpha' }),
      makeLink({ id: 'link-2', referral_program_id: 'rp-b', referral_program_name: 'Beta' }),
      makeLink({ id: 'link-3', referral_program_id: 'rp-a', referral_program_name: 'Alpha' }),
    ]
    const groups = groupByProgram(links)
    expect(groups).toHaveLength(2)
    const alphaGroup = groups.find(g => g.programId === 'rp-a')
    expect(alphaGroup?.links).toHaveLength(2)
  })
})

describe('isChildLink', () => {
  it('returns false for a manually-added link with no parent', () => {
    expect(isChildLink(makeLink({ parent_link_id: null }))).toBe(false)
  })

  it('returns true for an Amex-unfurled child link', () => {
    expect(isChildLink(makeLink({ parent_link_id: 'parent-1' }))).toBe(true)
  })
})

describe('getUnfurlStatus', () => {
  it('returns "never" when unfurl_requested_at is null', () => {
    expect(getUnfurlStatus(makeLink({ unfurl_requested_at: null }))).toBe('never')
  })

  it('returns "pending" when requested but neither completed nor failed yet', () => {
    expect(
      getUnfurlStatus(
        makeLink({
          unfurl_requested_at: '2024-01-01T00:00:00Z',
          unfurl_completed_at: null,
          unfurl_failed_at: null,
        }),
      ),
    ).toBe('pending')
  })

  it('returns "completed" when completed_at is at or after the current request', () => {
    expect(
      getUnfurlStatus(
        makeLink({
          unfurl_requested_at: '2024-01-01T00:00:00Z',
          unfurl_completed_at: '2024-01-01T00:05:00Z',
          unfurl_failed_at: null,
        }),
      ),
    ).toBe('completed')
  })

  it('returns "failed" when failed_at is at or after the current request', () => {
    expect(
      getUnfurlStatus(
        makeLink({
          unfurl_requested_at: '2024-01-01T00:00:00Z',
          unfurl_completed_at: null,
          unfurl_failed_at: '2024-01-01T00:05:00Z',
        }),
      ),
    ).toBe('failed')
  })

  it('returns "pending" (not "completed") when completed_at predates a fresh re-request', () => {
    // markReferralLinkUnfurlRequested clears unfurl_failed_at but NOT unfurl_completed_at, so
    // a successful prior run's completed_at can still be older than a brand-new request.
    expect(
      getUnfurlStatus(
        makeLink({
          unfurl_requested_at: '2024-02-01T00:00:00Z',
          unfurl_completed_at: '2024-01-01T00:05:00Z',
          unfurl_failed_at: null,
        }),
      ),
    ).toBe('pending')
  })

  it('returns "pending" (not "failed") when failed_at predates a fresh re-request', () => {
    expect(
      getUnfurlStatus(
        makeLink({
          unfurl_requested_at: '2024-02-01T00:00:00Z',
          unfurl_completed_at: null,
          unfurl_failed_at: '2024-01-01T00:05:00Z',
        }),
      ),
    ).toBe('pending')
  })
})
