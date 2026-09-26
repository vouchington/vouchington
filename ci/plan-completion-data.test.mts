import { describe, expect, it } from 'vitest'

import {
  assertCommentReadback,
  candidatePullRequestNumbers,
  isCurrentOpenPlan,
  markerComment,
  pullRequest,
} from './plan-completion-data.mts'

describe('plan completion API parsing', () => {
  it('fails closed on invalid current Plan and PR fields while retaining a null PR body', () => {
    expect(() =>
      isCurrentOpenPlan(JSON.stringify({ number: 1, state: 'other', title: 'Plan: x' }), 1),
    ).toThrow('Current Plan response is missing a matching number, state, or title')
    expect(() =>
      pullRequest(JSON.stringify({ body: '', merged_at: {}, number: 1, state: 'open' }), 1),
    ).toThrow('Current pull request response has an invalid merged_at')
    expect(
      pullRequest(JSON.stringify({ body: null, merged_at: null, number: 1, state: 'open' }), 1),
    ).toMatchObject({ body: '' })
  })

  it('rejects malformed timeline candidates, duplicate owned markers, and mismatched readback', () => {
    expect(() =>
      candidatePullRequestNumbers(
        JSON.stringify([
          [
            {
              event: 'cross-referenced',
              source: { issue: { number: 1, pull_request: {} }, type: 'issue' },
            },
          ],
        ]),
        'vouchington/vouchington',
      ),
    ).toThrow('Timeline pull request candidate is missing url')
    expect(
      candidatePullRequestNumbers(
        JSON.stringify([
          [
            {
              event: 'cross-referenced',
              source: {
                issue: {
                  number: 2,
                  pull_request: {
                    url: 'https://api.github.com/repos/other/repo/pulls/2',
                  },
                },
                type: 'issue',
              },
            },
          ],
        ]),
        'vouchington/vouchington',
      ),
    ).toEqual([])
    const marker = {
      body: '<!-- plan-completion-advisory -->',
      id: 1,
      user: { login: 'github-actions[bot]' },
    }
    expect(() => markerComment(JSON.stringify([[marker, marker]]))).toThrow(
      'Multiple workflow-owned advisory comments found',
    )
    expect(() =>
      assertCommentReadback(JSON.stringify({ ...marker, body: 'other' }), 1, marker.body),
    ).toThrow('Comment readback does not match the workflow-owned advisory')
  })
})
