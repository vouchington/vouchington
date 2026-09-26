import { describe, expect, it } from 'vitest'

import { runPlanCompletionSnapshot } from './plan-completion.mts'

const BODY =
  '<!-- plan-completion-advisory -->\n## Plan completion advisory\n\nPlan #726 has exactly one open non-closing sibling: #2. This is a current snapshot only; audit planned-but-unopened work before closing the Plan.'

function timeline(number: number) {
  return {
    event: 'cross-referenced',
    source: {
      issue: {
        number,
        pull_request: {
          url: `https://api.github.com/repos/vouchington/vouchington/pulls/${number}`,
        },
      },
      type: 'issue',
    },
  }
}

function basicSnapshot(calls: string[][], commentPages: unknown[][]) {
  return async (args: string[]): Promise<string> => {
    calls.push(args)
    if (args.some(arg => arg.endsWith('/issues')))
      return JSON.stringify([[{ number: 726, state: 'open', title: 'Plan: test' }]])
    if (args.some(arg => arg.endsWith('/issues/726')))
      return JSON.stringify({ number: 726, state: 'open', title: 'Plan: test' })
    if (args.some(arg => arg.endsWith('/timeline')))
      return JSON.stringify([[timeline(1)], [timeline(2)]])
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
    if (args.includes('POST')) return JSON.stringify({ id: 99 })
    if (args.some(arg => arg.endsWith('/comments/99')))
      return JSON.stringify({ body: BODY, id: 99, user: { login: 'github-actions[bot]' } })
    if (args.some(arg => arg.includes('/comments'))) return JSON.stringify(commentPages)
    return JSON.stringify({})
  }
}

describe('plan completion snapshot boundaries', () => {
  it('uses every timeline page and leaves an unchanged own warning idempotent across deliveries', async () => {
    const calls: string[][] = []
    const runGh = basicSnapshot(calls, [
      [{ body: BODY, id: 99, user: { login: 'github-actions[bot]' } }],
    ])

    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })
    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })

    expect(calls.some(call => call.includes('--paginate') && call.includes('--slurp'))).toBe(true)
    expect(calls.some(call => call.includes('POST') || call.includes('PATCH'))).toBe(false)
  })

  it('does not treat a human marker as workflow-owned', async () => {
    const calls: string[][] = []
    const runGh = basicSnapshot(calls, [[{ body: BODY, id: 55, user: { login: 'human' } }]])

    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })

    expect(calls.some(call => call.includes('POST'))).toBe(true)
  })

  it('preloads every Plan comment page before allowing an earlier warning write', async () => {
    const calls: string[][] = []
    const runGh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args.some(arg => arg.endsWith('/issues')))
        return JSON.stringify([
          [
            { number: 726, state: 'open', title: 'Plan: first' },
            { number: 727, state: 'open', title: 'Plan: second' },
          ],
        ])
      if (
        args.some(arg => arg.endsWith('/issues/726')) ||
        args.some(arg => arg.endsWith('/issues/727'))
      )
        return JSON.stringify({
          number: args.some(arg => arg.endsWith('/issues/726')) ? 726 : 727,
          state: 'open',
          title: 'Plan: current',
        })
      if (args.some(arg => arg.endsWith('/issues/726/timeline')))
        return JSON.stringify([[timeline(1), timeline(2)]])
      if (args.some(arg => arg.endsWith('/issues/727/timeline'))) return JSON.stringify([[]])
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
      if (args.some(arg => arg.endsWith('/issues/726/comments'))) return JSON.stringify([[]])
      if (args.some(arg => arg.endsWith('/issues/727/comments')))
        throw new Error('later comments unavailable')
      return JSON.stringify({})
    }

    await expect(
      runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh }),
    ).rejects.toThrow('later comments unavailable')
    expect(calls.some(call => call.includes('POST') || call.includes('PATCH'))).toBe(false)
  })
})
