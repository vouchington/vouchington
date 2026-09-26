import { describe, expect, it } from 'vitest'

import { runPlanCompletionSnapshot } from './plan-completion.mts'

describe('plan completion advisory races', () => {
  it('does not recreate a deleted recovery marker', async () => {
    const calls: string[][] = []
    let commentReads = 0
    const runGh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args.some(arg => arg.endsWith('/issues')))
        return JSON.stringify([[{ number: 726, state: 'open', title: 'Plan: test' }]])
      if (args.some(arg => arg.endsWith('/issues/726')))
        return JSON.stringify({ number: 726, state: 'open', title: 'Plan: test' })
      if (args.some(arg => arg.endsWith('/timeline'))) return JSON.stringify([[]])
      if (args.some(arg => arg.includes('/comments'))) {
        commentReads += 1
        return JSON.stringify(
          commentReads === 1
            ? [
                [
                  {
                    body: '<!-- plan-completion-advisory -->\nold',
                    id: 50,
                    user: { login: 'github-actions[bot]' },
                  },
                ],
              ]
            : [[]],
        )
      }
      return JSON.stringify({})
    }

    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })

    expect(calls.some(call => call.includes('POST') || call.includes('PATCH'))).toBe(false)
  })

  it('skips a Plan that closes between the snapshot and the advisory write', async () => {
    const calls: string[][] = []
    let planReads = 0
    const runGh = async (args: string[]): Promise<string> => {
      calls.push(args)
      if (args.some(arg => arg.endsWith('/issues')))
        return JSON.stringify([[{ number: 726, state: 'open', title: 'Plan: test' }]])
      if (args.some(arg => arg.endsWith('/issues/726')))
        return JSON.stringify({
          number: 726,
          state: ++planReads === 1 ? 'open' : 'closed',
          title: 'Plan: test',
        })
      if (args.some(arg => arg.endsWith('/timeline')))
        return JSON.stringify([
          [1, 2].map(number => ({
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
          })),
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
      if (args.some(arg => arg.includes('/comments'))) return JSON.stringify([[]])
      return JSON.stringify({})
    }

    await runPlanCompletionSnapshot({ repository: 'vouchington/vouchington', runGh })

    expect(calls.some(call => call.includes('POST') || call.includes('PATCH'))).toBe(false)
  })
})
