import { describe, expect, it } from 'vitest'

import { runPlanCompletionSnapshot } from './plan-completion.mts'

const REPOSITORY = 'vouchington/vouchington'
const PLAN_COUNT = 101
const PHASES = ['timeline', 'pull', 'plan', 'comments'] as const
type Phase = (typeof PHASES)[number]

function gate() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

function snapshotFixture() {
  const plans = Array.from({ length: PLAN_COUNT }, (_, index) => index + 1)
  const counts: Record<Phase, number> = { comments: 0, plan: 0, pull: 0, timeline: 0 }
  const maximum: Record<Phase, number> = { ...counts }
  const writes: number[] = []
  const bodies = new Map<number, string>()
  let pending: ReturnType<typeof gate>[] = []
  let batch = gate()
  let inFlight = 0
  let uncontrolled = false

  async function readPhase(phase: Phase) {
    if (uncontrolled) return
    const request = gate()
    pending.push(request)
    counts[phase] += 1
    inFlight += 1
    maximum[phase] = Math.max(maximum[phase], inFlight)
    const total = phase === 'pull' ? PLAN_COUNT * 2 : PLAN_COUNT
    if (pending.length >= 4 || counts[phase] === total) batch.resolve()
    try {
      await request.promise
    } finally {
      inFlight -= 1
    }
  }

  function release(error?: Error) {
    const requests = pending
    pending = []
    batch = gate()
    if (error) requests[0]!.reject(error)
    for (const request of requests.slice(error ? 1 : 0).reverse()) request.resolve()
  }

  async function runGh(args: string[]): Promise<string> {
    const path = args.find(arg => arg.startsWith('repos/'))!
    const number = Number(path.split('/').at(-1))
    if (args.includes('POST')) {
      const plan = Number(path.split('/').at(-2))
      writes.push(plan)
      bodies.set(plan, args.find(arg => arg.startsWith('body='))!.slice(5))
      return JSON.stringify({ id: plan })
    }
    if (path.includes('/issues/comments/'))
      return JSON.stringify({
        body: bodies.get(number),
        id: number,
        user: { login: 'github-actions[bot]' },
      })
    if (path.endsWith('/issues'))
      return JSON.stringify([
        plans.map(number => ({ number, state: 'open', title: 'Plan: discovered' })),
      ])
    if (path.endsWith('/timeline')) {
      await readPhase('timeline')
      const plan = Number(path.split('/').at(-2))
      return JSON.stringify([
        [2 * plan, 2 * plan + 1].map(number => ({
          event: 'cross-referenced',
          source: {
            issue: {
              number,
              pull_request: { url: `https://api.github.com/repos/${REPOSITORY}/pulls/${number}` },
            },
            type: 'issue',
          },
        })),
      ])
    }
    if (path.includes('/pulls/')) {
      await readPhase('pull')
      return JSON.stringify({
        body: `## Related issues\nRefs #${Math.floor(number / 2)}`,
        merged_at: number % 2 ? null : '2026-01-01',
        number,
        state: number % 2 ? 'open' : 'closed',
      })
    }
    if (path.endsWith('/comments')) {
      if (writes.length === 0 && counts.comments < PLAN_COUNT) await readPhase('comments')
      return JSON.stringify([[]])
    }
    if (counts.plan < PLAN_COUNT) await readPhase('plan')
    return JSON.stringify({ number, state: 'open', title: 'Plan: current' })
  }

  return {
    bodies,
    counts,
    maximum,
    plans,
    release,
    runGh,
    writes,
    get ready() {
      return batch.promise
    },
    get inFlight() {
      return inFlight
    },
    resume() {
      uncontrolled = true
      release()
    },
  }
}

describe('plan completion bounded snapshot', () => {
  it('bounds every read phase across more than one hundred Plans and candidates while preserving order', async () => {
    const fixture = snapshotFixture()
    const snapshot = runPlanCompletionSnapshot({ repository: REPOSITORY, runGh: fixture.runGh })
    try {
      for (const phase of PHASES) {
        const total = phase === 'pull' ? PLAN_COUNT * 2 : PLAN_COUNT
        for (let completed = 0; completed < total; completed += 4) {
          await fixture.ready
          expect(fixture.inFlight).toBeLessThanOrEqual(4)
          expect(fixture.writes).toEqual([])
          fixture.release()
        }
      }
      await snapshot
      expect(fixture.maximum).toEqual({ comments: 4, plan: 4, pull: 4, timeline: 4 })
      expect(fixture.counts).toEqual({ comments: 101, plan: 101, pull: 202, timeline: 101 })
      expect(fixture.writes).toEqual(fixture.plans)
      for (const number of fixture.plans)
        expect(fixture.bodies.get(number)).toContain(
          `Plan #${number} has exactly one open non-closing sibling: #${number * 2 + 1}.`,
        )
    } finally {
      fixture.resume()
      await snapshot
    }
  })

  it.each(PHASES)(
    'stops scheduling after an early %s read failure without writing an incomplete snapshot',
    async failingPhase => {
      const fixture = snapshotFixture()
      const failure = new Error('GitHub read unavailable')
      const snapshot = runPlanCompletionSnapshot({ repository: REPOSITORY, runGh: fixture.runGh })
      const rejected = snapshot.catch((error: unknown) => error)
      for (const phase of PHASES) {
        if (phase === failingPhase) break
        const total = phase === 'pull' ? PLAN_COUNT * 2 : PLAN_COUNT
        for (let completed = 0; completed < total; completed += 4) {
          await fixture.ready
          fixture.release()
        }
      }
      await fixture.ready
      fixture.release(failure)
      expect(await rejected).toBe(failure)
      expect(fixture.counts[failingPhase]).toBe(4)
      expect(fixture.writes).toEqual([])
      fixture.resume()
    },
  )
})
