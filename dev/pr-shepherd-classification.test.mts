import type { ClassifyItem, ClassifyPrComment } from 'pr-shepherd/classify'
import { describe, expect, it } from 'vitest'

import rule from '../.pr-shepherd/classification/codex-rate-limit.mts'

const CURRENT_QUOTA =
  'You have reached your Codex usage limits for security reviews. Please try again later.'
const CODE_REVIEW_QUOTA =
  'You have reached your Codex usage limits for code reviews. You can see your limits in the [Codex usage dashboard](https://chatgpt.com/codex/cloud/settings/usage).'
const ADMIN_CODE_REVIEW_QUOTA = `Codex usage limits have been reached for code reviews. Please check with the admins of this repo to increase the limits by adding credits.
Repo admins can enable using credits for code reviews in their [settings](https://chatgpt.com/codex/cloud/settings/code-review).`
const LEGACY_QUOTA = 'Codex usage limits have been reached. Please try again later.'
const CODEX_REVIEW_HEADING = '### 💡 Codex Review'
const ACTIVITY_TABLE = `<!-- codex-pull-request-review-summary -->

## Codex Review Summary

This comment shows the latest Codex review activity on this pull request.

| Review | Status | Commit | Review trigger |
| --- | --- | --- | --- |
| 📝 **Code Review** | ✅ **Completed** | \`abc1234\` | Draft marked ready |
`

const suppressAction = {
  autoResolve: true,
  suppress: true,
  reason: 'codex rate-limit notice',
} as const

const activitySuppressAction = {
  autoResolve: true,
  suppress: true,
  reason: 'codex review-summary activity notice',
} as const

function comment(author: string, body: string): ClassifyPrComment {
  return {
    kind: 'pr-comment',
    id: 'IC_test',
    author,
    authorType: 'Bot',
    body,
  }
}

describe('codex-rate-limit classification', () => {
  it.each(['chatgpt-codex-connector', 'chatgpt-codex-connector[bot]'] as const)(
    'suppresses the current security-review quota comment from %s',
    author => {
      expect(rule(comment(author, CURRENT_QUOTA))).toEqual(suppressAction)
    },
  )

  it('suppresses the live code-review quota comment with a dashboard link', () => {
    expect(rule(comment('chatgpt-codex-connector[bot]', CODE_REVIEW_QUOTA))).toEqual(suppressAction)
  })

  it('suppresses the live code-review quota comment that asks admins to add credits', () => {
    expect(rule(comment('chatgpt-codex-connector[bot]', ADMIN_CODE_REVIEW_QUOTA))).toEqual(
      suppressAction,
    )
  })

  it('suppresses the Codex Review Summary activity table with no findings', () => {
    expect(rule(comment('chatgpt-codex-connector[bot]', ACTIVITY_TABLE))).toEqual(
      activitySuppressAction,
    )
  })

  it('suppresses the legacy usage-limits-have-been-reached phrasing', () => {
    expect(rule(comment('chatgpt-codex-connector[bot]', LEGACY_QUOTA))).toEqual(suppressAction)
  })

  it('does not suppress a real Codex Review summary without a quota phrase', () => {
    const body = `\n${CODEX_REVIEW_HEADING}\n\nHere are some automated review suggestions for this pull request.\n`
    expect(rule(comment('chatgpt-codex-connector[bot]', body))).toBeNull()
  })

  it('does not suppress a real Codex Review that quotes the quota sentence', () => {
    const body = `\n${CODEX_REVIEW_HEADING}\n\nThe copy currently says "${CURRENT_QUOTA}"\n`
    expect(rule(comment('chatgpt-codex-connector[bot]', body))).toBeNull()
  })

  it('does not suppress a quota phrase from another author', () => {
    expect(rule(comment('coderabbitai[bot]', CURRENT_QUOTA))).toBeNull()
  })

  it('does not treat a non-comment Codex item without a quota phrase as suppressed', () => {
    const item: ClassifyItem = {
      kind: 'review-summary',
      id: 'PRR_test',
      author: 'chatgpt-codex-connector[bot]',
      authorType: 'Bot',
      body: `\n${CODEX_REVIEW_HEADING}\n`,
    }
    expect(rule(item)).toBeNull()
  })
})
