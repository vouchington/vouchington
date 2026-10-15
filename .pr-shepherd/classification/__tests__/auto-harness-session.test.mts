import type { ClassifyPrComment } from 'pr-shepherd/classify'
import { describe, expect, it } from 'vitest'
import rule from '../auto-harness-session.mts'

const POINTER =
  '👀 [View the Auto Harness session](https://d2itfsupognuru.cloudfront.net/sessions/sess-1234abcd).\n\n<!-- auto-harness-session:sess-1234abcd -->'
const COMMENT: ClassifyPrComment = {
  kind: 'pr-comment',
  id: 'IC_session_pointer',
  author: 'github-actions[bot]',
  authorType: 'Bot',
  body: POINTER,
}

describe('Auto Harness session classification', () => {
  it.each(['github-actions', 'github-actions[bot]'])(
    'hides and automatically minimizes the session-only pointer from %s',
    author => {
      expect(rule({ ...COMMENT, author })).toMatchObject({
        suppress: true,
        autoResolve: true,
      })
    },
  )

  it.each([
    `${POINTER}\n\nFound an authorization issue.`,
    `Found an authorization issue.\n\n${POINTER}`,
    POINTER.replace('<!-- auto-harness-session:sess-1234abcd -->', ''),
    POINTER.replace('auto-harness-session:sess-1234abcd', 'auto-harness-session:sess-abcd1234'),
    POINTER.replace('d2itfsupognuru.cloudfront.net', 'example.com'),
    '<!-- auto-harness-session:sess-1234abcd -->',
  ])('keeps findings and incomplete or mismatched pointers visible', body => {
    expect(rule({ ...COMMENT, body })).toBeNull()
  })

  it('keeps the same text from another bot visible', () => {
    expect(rule({ ...COMMENT, author: 'another-bot[bot]' })).toBeNull()
  })

  it.each(['User', 'Unknown'] as const)('requires a confirmed Bot author, not %s', authorType => {
    expect(rule({ ...COMMENT, authorType })).toBeNull()
  })

  it.each(['review-thread', 'review-summary', 'changes-requested'] as const)(
    'keeps %s review feedback visible',
    kind => {
      expect(rule({ ...COMMENT, kind })).toBeNull()
    },
  )
})
