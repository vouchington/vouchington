import { describe, expect, it } from 'vitest'

import { createIssueClosureResolver, parsePullRequestIdentity } from '../issue-closure.mts'

describe('merged PR closure resolution', () => {
  it('parses exact PR repository identity', () => {
    expect(
      parsePullRequestIdentity(
        JSON.stringify({
          number: 77,
          mergeCommit: { oid: 'merge-77' },
          state: 'MERGED',
          url: 'https://github.com/Owner/Repo/pull/77',
        }),
      ),
    ).toEqual({
      mergeCommitOid: 'merge-77',
      number: 77,
      owner: 'Owner',
      repo: 'Repo',
      state: 'MERGED',
    })
  })

  it('parses the latest ClosedEvent pull request closer', async () => {
    const resolve = createIssueClosureResolver(
      () =>
        Promise.resolve(
          JSON.stringify({
            data: {
              repository: {
                issue: {
                  timelineItems: {
                    nodes: [
                      {
                        closer: {
                          __typename: 'PullRequest',
                          number: 77,
                          url: 'https://github.com/owner/repo/pull/77',
                        },
                      },
                    ],
                  },
                },
              },
            },
          }),
        ),
      { mergeCommitOid: 'merge-77', number: 77, owner: 'owner', repo: 'repo', state: 'MERGED' },
    )
    await expect(
      resolve({ key: '#42', number: 42, owner: undefined, repo: undefined }),
    ).resolves.toEqual({ closer: { number: 77, owner: 'owner', repo: 'repo' }, ok: true })
  })

  it('fails closed on malformed closure responses', async () => {
    const resolve = createIssueClosureResolver(() => Promise.resolve('{}'), {
      mergeCommitOid: 'merge-77',
      number: 77,
      owner: 'owner',
      repo: 'repo',
      state: 'MERGED',
    })
    await expect(
      resolve({ key: '#42', number: 42, owner: undefined, repo: undefined }),
    ).resolves.toEqual({ error: 'closure response missing latest ClosedEvent', ok: false })
  })

  it('returns a null closer for a manual latest closure', async () => {
    const resolve = createIssueClosureResolver(
      () =>
        Promise.resolve(
          JSON.stringify({
            data: {
              repository: {
                issue: { timelineItems: { nodes: [{ closer: null }] } },
              },
            },
          }),
        ),
      { mergeCommitOid: 'merge-77', number: 77, owner: 'owner', repo: 'repo', state: 'MERGED' },
    )
    await expect(
      resolve({ key: '#42', number: 42, owner: undefined, repo: undefined }),
    ).resolves.toEqual({ closer: null, ok: true })
  })

  it('maps the target PR merge commit back to that pull request', async () => {
    const resolve = createIssueClosureResolver(
      () =>
        Promise.resolve(
          JSON.stringify({
            data: {
              repository: {
                issue: {
                  timelineItems: {
                    nodes: [{ closer: { __typename: 'Commit', oid: 'a1b2c3' } }],
                  },
                },
              },
            },
          }),
        ),
      { mergeCommitOid: 'A1B2C3', number: 77, owner: 'owner', repo: 'repo', state: 'MERGED' },
    )
    await expect(
      resolve({ key: '#42', number: 42, owner: undefined, repo: undefined }),
    ).resolves.toEqual({ closer: { number: 77, owner: 'owner', repo: 'repo' }, ok: true })
  })

  it('returns a null closer for an unrelated commit closure', async () => {
    const resolve = createIssueClosureResolver(
      () =>
        Promise.resolve(
          JSON.stringify({
            data: {
              repository: {
                issue: {
                  timelineItems: {
                    nodes: [{ closer: { __typename: 'Commit', oid: 'other-commit' } }],
                  },
                },
              },
            },
          }),
        ),
      { mergeCommitOid: 'merge-77', number: 77, owner: 'owner', repo: 'repo', state: 'MERGED' },
    )
    await expect(
      resolve({ key: '#42', number: 42, owner: undefined, repo: undefined }),
    ).resolves.toEqual({ closer: null, ok: true })
  })
})
