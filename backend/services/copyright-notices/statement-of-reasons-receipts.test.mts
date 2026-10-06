import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyrightEmailSubject,
  copyrightEuReceiptText,
  copyrightIntakeRejectionText,
  copyrightNotificationCopy,
} from './statement-of-reasons-wording.mts'

const ORIGIN = 'https://voucha.test'
const noticeId = crypto.randomUUID()

describe('copyright receipts and subjects', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_ORIGIN', ORIGIN)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('tells a guest to reply to the decision email', () => {
    const text = copyrightEuReceiptText(noticeId, false)

    expect(text).toContain('reply to the decision email to file a complaint')
    expect(text).not.toContain('case page')
  })

  it('tells a signed-in notifier to use the complaint link on the case page', () => {
    const text = copyrightEuReceiptText(noticeId, true)

    expect(text).toContain(
      `use the complaint link on your case page: ${ORIGIN}/copyright/notices/${noticeId}.`,
    )
    expect(text).not.toContain('reply to the decision email')
  })

  it('says an image was restricted in the poster subject', () => {
    expect(copyrightEmailSubject('poster_restriction_notice')).toBe(
      'Your image was restricted after a copyright notice',
    )
  })

  it('writes absolute routes into the intake rejection and US fallback copy', () => {
    for (const text of [
      copyrightIntakeRejectionText(new Date(), false),
      copyrightNotificationCopy('claimant_decision_notice').body,
    ])
      expect(text).toContain(
        `New notice: ${ORIGIN}/copyright/notices/new. Designated agent: ${ORIGIN}/copyright/designated-agent.`,
      )
  })
})
