import { describe, expect, it } from 'vitest'

import {
  createClosingIssueReferenceResolver,
  formatHints,
  resolveClosingIssueReference,
} from '../related-issues.mts'
import {
  parseClosingIssueReferences,
  parseGitHubIssueApiResponse,
  validateResolvedIssueReferences,
  type ClosingIssueReference,
} from '../closing-refs.mts'
import { findEscapeCommentClosingKeywordLeaks } from '../escape-comment-leaks.mts'

describe('formatHints', () => {
  it('returns an empty string for no candidates', () => {
    expect(formatHints([])).toBe('')
  })

  it('formats candidates as a hint list', () => {
    const candidates = [
      { number: 42, title: 'Add PR helper', url: 'https://github.com/owner/repo/issues/42' },
    ]
    const output = formatHints(candidates)
    expect(output).toContain('#42')
    expect(output).toContain('Add PR helper')
    expect(output).toContain('Advisory')
  })
})

describe('parseGitHubIssueApiResponse', () => {
  it('parses issue API fields', () => {
    const issue = parseGitHubIssueApiResponse(
      JSON.stringify({
        body: '- [ ] remaining',
        html_url: 'https://github.com/owner/repo/issues/42',
        number: 42,
        state: 'open',
        title: 'Open issue',
      }),
    )
    expect(issue).toEqual({
      body: '- [ ] remaining',
      isPullRequest: false,
      number: 42,
      state: 'open',
      title: 'Open issue',
      url: 'https://github.com/owner/repo/issues/42',
    })
  })

  it('marks pull request-backed issue API responses', () => {
    const issue = parseGitHubIssueApiResponse(
      JSON.stringify({
        html_url: 'https://github.com/owner/repo/pull/42',
        number: 42,
        pull_request: { url: 'https://api.github.com/repos/owner/repo/pulls/42' },
        state: 'closed',
        title: 'Merged PR',
      }),
    )
    expect(issue.isPullRequest).toBe(true)
  })

  it('throws when required issue API fields are missing', () => {
    expect(() => parseGitHubIssueApiResponse(JSON.stringify({ number: 42 }))).toThrow(
      'missing required fields',
    )
  })
})

describe('parseClosingIssueReferences', () => {
  it('does not match issue refs split onto the next line', () => {
    expect(parseClosingIssueReferences('Closes\n#42')).toEqual([])
  })

  it('recognizes a full GitHub issue URL as a closing reference (a form used for real in this repo)', () => {
    const refs = parseClosingIssueReferences(
      'Closes https://github.com/vouchington/vouchington/issues/1838',
    )
    expect(refs).toEqual([
      {
        key: 'vouchington/vouchington#1838',
        number: 1838,
        owner: 'vouchington',
        repo: 'vouchington',
      },
    ])
  })

  it('dedupes a full URL and a #N/owner/repo#N reference to the same issue', () => {
    const refs = parseClosingIssueReferences(
      'Closes vouchington/vouchington#1838\n' +
        'Fixes https://github.com/vouchington/vouchington/issues/1838',
    )
    expect(refs).toHaveLength(1)
  })
})

describe('findEscapeCommentClosingKeywordLeaks', () => {
  it('flags a closing keyword hidden inside an escape comment reason', () => {
    const body =
      'Part of #10937\n' +
      '<!-- related-issues-validation: allow #10937 because a later PR closes #10937 once done -->'
    const leaks = findEscapeCommentClosingKeywordLeaks(body)
    expect(leaks).toHaveLength(1)
    expect(leaks[0]).toContain('#10937')
  })

  it('flags a leak referencing a different issue than the one being escaped', () => {
    const body =
      '<!-- related-issues-validation: allow #1 because this fixes #2 as a side effect -->'
    const leaks = findEscapeCommentClosingKeywordLeaks(body)
    expect(leaks).toHaveLength(1)
    expect(leaks[0]).toContain('#2')
  })

  it('allows a reason with no closing keyword', () => {
    const body = '<!-- related-issues-validation: allow #1 because tracked elsewhere -->'
    expect(findEscapeCommentClosingKeywordLeaks(body)).toEqual([])
  })

  it('does not hang scanning an unterminated escape comment (ReDoS regression)', () => {
    const body = `<!-- related-issues-validation: allow #1 because${' '.repeat(50_000)}`
    const start = Date.now()
    const leaks = findEscapeCommentClosingKeywordLeaks(body)
    // Wall-clock guard, not an algorithmic-complexity assertion: real catastrophic backtracking
    // would take vastly longer than any CPU-contention jitter this ceiling needs to absorb, so
    // this still catches a genuine regression. Observed on GitHub-hosted ubuntu-latest (2 vCPUs,
    // shared across this project's parallel workers): 1478ms, vs. this test's original 1000ms
    // ceiling tuned for faster/self-hosted hardware. 5000ms (~3.4x) absorbs run-to-run contention
    // variance.
    expect(Date.now() - start).toBeLessThan(5000)
    expect(leaks).toEqual([])
  })

  it('flags a leaked closing keyword written as a full GitHub issue URL', () => {
    const body =
      '<!-- related-issues-validation: allow #1 because a later PR ' +
      'closes https://github.com/owner/repo/issues/2 -->'
    const leaks = findEscapeCommentClosingKeywordLeaks(body)
    expect(leaks).toHaveLength(1)
    expect(leaks[0]).toContain('owner/repo#2')
  })

  it('bounds diagnostic output when one reason leaks many references', () => {
    const manyRefs = Array.from({ length: 50 }, (_, i) => `fixes #${i + 1}`).join(' ')
    const body = `<!-- related-issues-validation: allow #1 because ${manyRefs} -->`
    const leaks = findEscapeCommentClosingKeywordLeaks(body)
    expect(leaks).toHaveLength(1)
    expect(leaks[0]).toContain('and 40 more')
    expect(leaks[0].length).toBeLessThan(1000)
  })

  it('truncates an oversized reason instead of repeating it in full', () => {
    const longReason = `closes #1 ${'x'.repeat(100_000)}`
    const body = `<!-- related-issues-validation: allow #2 because ${longReason} -->`
    const leaks = findEscapeCommentClosingKeywordLeaks(body)
    expect(leaks).toHaveLength(1)
    expect(leaks[0].length).toBeLessThan(1000)
  })

  it('bounds the total number of reported leaks across many escape comments', () => {
    const body = Array.from(
      { length: 50 },
      (_, i) => `<!-- related-issues-validation: allow #${i} because this closes #${i + 1000} -->`,
    ).join('\n')
    const leaks = findEscapeCommentClosingKeywordLeaks(body)
    expect(leaks).toHaveLength(21)
    expect(leaks.at(-1)).toContain('Additional related-issues-validation escape comments')
  })
})

describe('validateResolvedIssueReferences', () => {
  it('does not hang scanning an unterminated escape comment (ReDoS regression)', () => {
    const refs: ClosingIssueReference[] = [
      { key: '#1', number: 1, owner: undefined, repo: undefined },
    ]
    const body = `Closes #1\n<!-- related-issues-validation: allow #1 because${' '.repeat(50_000)}`
    const start = Date.now()
    const result = validateResolvedIssueReferences(body, refs, new Map())
    expect(Date.now() - start).toBeLessThan(1000)
    expect(result.errors).toHaveLength(1)
  })
})

describe('resolveClosingIssueReference', () => {
  it('uses the current repository for local #N references', async () => {
    const calls: string[][] = []
    const result = await resolveClosingIssueReference(
      { key: '#42', number: 42, owner: undefined, repo: undefined },
      args => {
        calls.push(args)
        if (args[0] === 'repo') {
          return Promise.resolve(JSON.stringify({ nameWithOwner: 'owner/repo' }))
        }
        return Promise.resolve(
          JSON.stringify({
            html_url: 'https://github.com/owner/repo/issues/42',
            number: 42,
            state: 'open',
            title: 'Open issue',
          }),
        )
      },
    )
    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      ['repo', 'view', '--json', 'nameWithOwner'],
      ['api', 'repos/owner/repo/issues/42'],
    ])
  })

  it('uses the explicit repository for owner/repo#N references', async () => {
    const calls: string[][] = []
    const result = await resolveClosingIssueReference(
      { key: 'other/repo#7', number: 7, owner: 'other', repo: 'repo' },
      args => {
        calls.push(args)
        return Promise.resolve(
          JSON.stringify({
            html_url: 'https://github.com/other/repo/issues/7',
            number: 7,
            state: 'open',
            title: 'Cross repo issue',
          }),
        )
      },
    )
    expect(result.ok).toBe(true)
    expect(calls).toEqual([['api', 'repos/other/repo/issues/7']])
  })

  it('returns a lookup error when GitHub resolution fails', async () => {
    const result = await resolveClosingIssueReference(
      { key: '#42', number: 42, owner: undefined, repo: undefined },
      () => Promise.reject(new Error('not found')),
    )
    expect(result).toEqual({ error: 'not found', ok: false })
  })
})

describe('createClosingIssueReferenceResolver', () => {
  it('reuses the current repository lookup for multiple local references', async () => {
    const calls: string[][] = []
    const resolve = createClosingIssueReferenceResolver(args => {
      calls.push(args)
      if (args[0] === 'repo') {
        return Promise.resolve(JSON.stringify({ nameWithOwner: 'owner/repo' }))
      }
      return Promise.resolve(
        JSON.stringify({
          html_url: `https://github.com/owner/repo/issues/${args[1]?.split('/').at(-1)}`,
          number: Number(args[1]?.split('/').at(-1)),
          state: 'open',
          title: 'Open issue',
        }),
      )
    })

    await resolve({ key: '#1', number: 1, owner: undefined, repo: undefined })
    await resolve({ key: '#2', number: 2, owner: undefined, repo: undefined })

    expect(calls.filter(args => args[0] === 'repo')).toHaveLength(1)
    expect(calls.filter(args => args[0] === 'api')).toHaveLength(2)
  })
})
