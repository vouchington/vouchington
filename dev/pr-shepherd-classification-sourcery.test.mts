import type { ClassifyItem } from 'pr-shepherd/classify'
import { describe, expect, it } from 'vitest'

import rule from '../.pr-shepherd/classification/sourcery-no-access.mts'

const UPSELL = `Hi @jonathanong! 👋

Your private repo does not have access to Sourcery.

Please [upgrade](https://app.sourcery.ai/login?connection=github&git_namespace_id=311973835&from_surface=github_bot&intent=private_repo_upsell) to continue using Sourcery ✨`

const suppressAction = {
  autoResolve: true,
  suppress: true,
  reason: 'sourcery no-access upsell',
} as const

function reviewSummary(author: string, body: string): ClassifyItem {
  return {
    kind: 'review-summary',
    id: 'PRR_test',
    author,
    authorType: 'Bot',
    body,
  }
}

describe('sourcery-no-access classification', () => {
  it.each(['sourcery-ai', 'sourcery-ai[bot]'] as const)(
    'suppresses the no-access upsell from %s',
    author => {
      expect(rule(reviewSummary(author, UPSELL))).toEqual(suppressAction)
    },
  )

  it('does not suppress a real Sourcery review', () => {
    const body = "## Reviewer's Guide\n\nThis change narrows the retry rule to readiness failures."
    expect(rule(reviewSummary('sourcery-ai[bot]', body))).toBeNull()
  })

  it('does not suppress a real Sourcery review that quotes the upsell sentence', () => {
    const body = `## Reviewer's Guide\n\nThe copy currently reads "does not have access to Sourcery".`
    expect(rule(reviewSummary('sourcery-ai[bot]', body))).toBeNull()
  })

  it('does not suppress the same body from another author', () => {
    expect(rule(reviewSummary('coderabbitai[bot]', UPSELL))).toBeNull()
  })
})
