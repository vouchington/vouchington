import { describe, expect, it } from 'vitest'

import {
  buildMilestoneListArgs,
  findMilestoneCompletionSiblings,
  MILESTONE_COMPLETION_REMAINDER,
  type MilestoneGroup,
} from '../milestone-query.mts'

const REPO = 'vouchington/vouchington'
const OTHER_REPO = 'other/repo'
const MILESTONE = 'Engineering Quality & Automation'

function fakeRunGh(issuesByMilestone: Record<string, Array<{ number: number; title: string }>>) {
  return (args: string[]) => {
    const milestone = args[args.indexOf('--milestone') + 1]
    return Promise.resolve(JSON.stringify(issuesByMilestone[milestone] ?? []))
  }
}

function group(overrides: Partial<MilestoneGroup>): MilestoneGroup {
  return { milestone: MILESTONE, numbers: new Set<number>(), repo: REPO, ...overrides }
}

describe('buildMilestoneListArgs', () => {
  it('builds an open-state milestone query', () => {
    expect(buildMilestoneListArgs(REPO, MILESTONE)).toEqual([
      'issue',
      'list',
      '--repo',
      REPO,
      '--milestone',
      MILESTONE,
      '--state',
      'open',
      '--json',
      'number,title',
      '--limit',
      '100',
    ])
  })
})

describe('findMilestoneCompletionSiblings', () => {
  it('respects the exact MILESTONE_COMPLETION_REMAINDER boundary', () => {
    expect(MILESTONE_COMPLETION_REMAINDER).toBe(3)
  })

  it('fires on the #8170 shape: 13 of 14 closed, 1 remaining', async () => {
    const allFourteen = Array.from({ length: 14 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
    }))
    const closed = new Set(allFourteen.slice(0, 13).map(issue => issue.number))
    const runGh = fakeRunGh({ [MILESTONE]: allFourteen })
    const groups = new Map([['k', group({ numbers: closed })]])
    const siblings = await findMilestoneCompletionSiblings(runGh, groups)
    expect(siblings).toEqual([{ milestone: MILESTONE, number: 14, repo: REPO, title: 'Issue 14' }])
  })

  it('stays silent on routine work: 1 of 28 closed, 27 remaining', async () => {
    const allTwentyEight = Array.from({ length: 28 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
    }))
    const runGh = fakeRunGh({ [MILESTONE]: allTwentyEight })
    const groups = new Map([['k', group({ numbers: new Set([1]) })]])
    await expect(findMilestoneCompletionSiblings(runGh, groups)).resolves.toEqual([])
  })

  it('issues zero calls for an empty group map', async () => {
    let calls = 0
    const runGh = (_args: string[]) => {
      calls += 1
      return Promise.resolve('[]')
    }
    await expect(findMilestoneCompletionSiblings(runGh, new Map())).resolves.toEqual([])
    expect(calls).toBe(0)
  })

  it('queries each group under its own repo', async () => {
    const runGh = (args: string[]) => {
      const repoArg = args[args.indexOf('--repo') + 1]
      return Promise.resolve(
        repoArg === OTHER_REPO ? JSON.stringify([{ number: 9, title: 'Foreign issue' }]) : '[]',
      )
    }
    const groups = new Map([['k', group({ repo: OTHER_REPO })]])
    const siblings = await findMilestoneCompletionSiblings(runGh, groups)
    expect(siblings).toEqual([
      { milestone: MILESTONE, number: 9, repo: OTHER_REPO, title: 'Foreign issue' },
    ])
  })

  it('degrades one failing group to no siblings while other groups still complete', async () => {
    const runGh = (args: string[]) => {
      const repoArg = args[args.indexOf('--repo') + 1]
      if (repoArg === OTHER_REPO) return Promise.reject(new Error('no access to other/repo'))
      return Promise.resolve(JSON.stringify([{ number: 9, title: 'Local issue' }]))
    }
    const groups = new Map([
      ['local', group({ repo: REPO })],
      ['foreign', group({ repo: OTHER_REPO })],
    ])
    const siblings = await findMilestoneCompletionSiblings(runGh, groups)
    expect(siblings).toEqual([
      { milestone: MILESTONE, number: 9, repo: REPO, title: 'Local issue' },
    ])
  })
})
