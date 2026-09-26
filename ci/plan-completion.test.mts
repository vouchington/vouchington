import { describe, expect, it } from 'vitest'

import { openPlans, pullRequest } from './plan-completion-data.mts'
import { runPlanCompletionSnapshot } from './plan-completion.mts'

const STRANDED =
  '<!-- plan-completion-advisory -->\n## Plan completion advisory\n\nPlan #726 has exactly one open non-closing sibling: #2. This is a current snapshot only; audit planned-but-unopened work before closing the Plan.'
const RECOVERED =
  '<!-- plan-completion-advisory -->\n## Plan completion advisory\n\nPlan #726 has no current completion advisory. This is a current snapshot only; audit planned-but-unopened work before closing the Plan.'

describe('plan completion snapshot', () => {
  it('fails closed on malformed issue pages and treats a null PR body as an edited-away reference', () => {
    expect(() => openPlans(JSON.stringify([[{ number: 726, title: 'Plan: test' }]]))).toThrow(
      'Open issues response is missing number, state, or title',
    )
    expect(
      pullRequest(JSON.stringify({ body: null, merged_at: null, number: 1, state: 'open' }), 1),
    ).toMatchObject({
      body: '',
    })
  })

  it('reads complete pages before mutating its own advisory comment', async () => {
    const calls: string[][] = []
    const runGh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args.includes('POST') || args.includes('PATCH')) return JSON.stringify({ id: 99 })
      if (args.some(arg => arg.endsWith('/issues')))
        return JSON.stringify([[{ number: 726, state: 'open', title: 'Plan: test' }]])
      if (args.some(arg => arg.endsWith('/issues/726')))
        return JSON.stringify({ number: 726, state: 'open', title: 'Plan: test' })
      if (args.some(arg => arg.endsWith('/timeline')))
        return JSON.stringify([
          [
            {
              event: 'cross-referenced',
              source: {
                type: 'issue',
                issue: {
                  number: 1,
                  pull_request: {
                    url: 'https://api.github.com/repos/vouchington/vouchington/pulls/1',
                  },
                },
              },
            },
            {
              event: 'cross-referenced',
              source: {
                type: 'issue',
                issue: {
                  number: 2,
                  pull_request: {
                    url: 'https://api.github.com/repos/vouchington/vouchington/pulls/2',
                  },
                },
              },
            },
            {
              event: 'cross-referenced',
              source: {
                type: 'issue',
                issue: {
                  number: 2,
                  pull_request: {
                    url: 'https://api.github.com/repos/vouchington/vouchington/pulls/2',
                  },
                },
              },
            },
          ],
        ])
      if (args.some(arg => arg.endsWith('/pulls/1')))
        return JSON.stringify({
          body: '## Related issues\nRefs #726',
          merged_at: '2026-01-01',
          number: 1,
          state: 'closed',
        })
      if (args.some(arg => arg.endsWith('/pulls/2')))
        return JSON.stringify({
          body: '## Related issues\nRefs #726',
          merged_at: null,
          number: 2,
          state: 'open',
        })
      if (args.some(arg => arg.endsWith('/comments/99')))
        return JSON.stringify({ body: STRANDED, id: 99, user: { login: 'github-actions[bot]' } })
      if (args.some(arg => arg.includes('/comments'))) return JSON.stringify([[]])
      return JSON.stringify({ body: 'unexpected' })
    }

    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })

    expect(calls[0]).toContain('repos/vouchington/vouchington/issues')
    expect(calls[0]).toEqual(expect.arrayContaining(['-X', 'GET']))
    expect(
      calls.some(call => call.includes('repos/vouchington/vouchington/issues/726/timeline')),
    ).toBe(true)
    expect(calls.some(call => call.includes('repos/vouchington/vouchington/pulls/1'))).toBe(true)
    expect(calls.some(call => call.includes('repos/vouchington/vouchington/pulls/2'))).toBe(true)
    expect(calls.at(-1)).toContain('repos/vouchington/vouchington/issues/comments/99')
  })

  it('updates an existing own marker comment and reads it back', async () => {
    const calls: string[][] = []
    const runGh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args.includes('POST') || args.includes('PATCH')) return JSON.stringify({ id: 50 })
      if (args.some(arg => arg.endsWith('/issues')))
        return JSON.stringify([[{ number: 726, state: 'open', title: 'Plan: test' }]])
      if (args.some(arg => arg.endsWith('/issues/726')))
        return JSON.stringify({ number: 726, state: 'open', title: 'Plan: test' })
      if (args.some(arg => arg.endsWith('/timeline')))
        return JSON.stringify([
          [
            {
              event: 'cross-referenced',
              source: {
                type: 'issue',
                issue: {
                  number: 1,
                  pull_request: {
                    url: 'https://api.github.com/repos/vouchington/vouchington/pulls/1',
                  },
                },
              },
            },
            {
              event: 'cross-referenced',
              source: {
                type: 'issue',
                issue: {
                  number: 2,
                  pull_request: {
                    url: 'https://api.github.com/repos/vouchington/vouchington/pulls/2',
                  },
                },
              },
            },
          ],
        ])
      if (args.some(arg => arg.endsWith('/pulls/1')))
        return JSON.stringify({
          body: '## Related issues\nRefs #726',
          merged_at: '2026-01-01',
          number: 1,
          state: 'closed',
        })
      if (args.some(arg => arg.endsWith('/pulls/2')))
        return JSON.stringify({
          body: '## Related issues\nRefs #726',
          merged_at: null,
          number: 2,
          state: 'open',
        })
      if (args.some(arg => arg.endsWith('/comments/50')))
        return JSON.stringify({ body: STRANDED, id: 50, user: { login: 'github-actions[bot]' } })
      if (args.some(arg => arg.includes('/comments'))) {
        return JSON.stringify([
          [
            {
              body: '<!-- plan-completion-advisory -->\nold',
              id: 50,
              user: { login: 'github-actions[bot]' },
            },
          ],
        ])
      }
      return JSON.stringify({ id: 50 })
    }

    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })

    expect(calls.some(call => call.includes('PATCH'))).toBe(true)
    expect(calls.at(-1)).toContain('repos/vouchington/vouchington/issues/comments/50')
  })

  it('does not write a comment when the snapshot has no advisory', async () => {
    const calls: string[][] = []
    const runGh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args.some(arg => arg.endsWith('/issues')))
        return JSON.stringify([[{ number: 726, state: 'open', title: 'Plan: test' }]])
      if (args.some(arg => arg.endsWith('/issues/726')))
        return JSON.stringify({ number: 726, state: 'open', title: 'Plan: test' })
      if (args.some(arg => arg.endsWith('/timeline'))) return JSON.stringify([[]])
      return JSON.stringify([[]])
    }

    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })

    expect(calls.some(call => call.includes('POST') || call.includes('PATCH'))).toBe(false)
  })

  it('clears a previous own warning after the Plan recovers', async () => {
    const calls: string[][] = []
    const runGh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args.includes('POST') || args.includes('PATCH')) return JSON.stringify({ id: 50 })
      if (args.some(arg => arg.endsWith('/issues')))
        return JSON.stringify([[{ number: 726, state: 'open', title: 'Plan: test' }]])
      if (args.some(arg => arg.endsWith('/issues/726')))
        return JSON.stringify({ number: 726, state: 'open', title: 'Plan: test' })
      if (args.some(arg => arg.endsWith('/timeline'))) return JSON.stringify([[]])
      if (args.some(arg => arg.endsWith('/comments/50')))
        return JSON.stringify({ body: RECOVERED, id: 50, user: { login: 'github-actions[bot]' } })
      if (args.some(arg => arg.includes('/comments')))
        return JSON.stringify([
          [
            {
              body: '<!-- plan-completion-advisory -->\nold',
              id: 50,
              user: { login: 'github-actions[bot]' },
            },
          ],
        ])
      return JSON.stringify({ id: 50 })
    }

    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })

    const update = calls.find(call => call.includes('PATCH'))
    expect(update).toContain(`body=${RECOVERED}`)
  })

  it('fails before writes when a cross-reference timeline row is malformed', async () => {
    const calls: string[][] = []
    const runGh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args.some(arg => arg.endsWith('/issues')))
        return JSON.stringify([[{ number: 726, state: 'open', title: 'Plan: test' }]])
      if (args.some(arg => arg.endsWith('/timeline')))
        return JSON.stringify([
          [
            {
              event: 'cross-referenced',
              source: {
                issue: { number: 1, pull_request: { url: 'not-a-github-api-url' } },
                type: 'issue',
              },
            },
          ],
        ])
      return JSON.stringify({})
    }

    await expect(
      runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh }),
    ).rejects.toThrow('Timeline pull request candidate has invalid url')
    expect(calls.some(call => call.includes('POST') || call.includes('PATCH'))).toBe(false)
  })
})
