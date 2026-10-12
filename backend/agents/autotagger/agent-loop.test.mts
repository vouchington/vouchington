import { describe, expect, it, vi } from 'vitest'
import type { ToolTurnRequest, ToolTurnResult } from '@modules/model-providers/tool-turn-types'
import { makeToolTurnResult } from '@voucha/test-helpers/agents/model-call-result'
import { runAutotaggerAgentLoop, type AutotaggerAgentBounds } from './agent-loop.mts'
import { buildAutotaggerAgentTools, type SearchTopics } from './agent-tools.mts'

const CANDIDATES = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
const BOUNDS: AutotaggerAgentBounds = { maxTurns: 4, maxToolCalls: 2, maxOutputTokens: 100 }

const submit = (...ids: string[]) => ({ name: 'submit_topics', input: { topic_ids: ids } })
const search = (query: string) => ({ name: 'lookup_candidate_topics', input: { query } })

function run(
  turns: ToolTurnResult[],
  options: { bounds?: AutotaggerAgentBounds; hits?: { id: string; name: string }[] } = {},
) {
  const queue = [...turns]
  const requests: ToolTurnRequest[] = []
  const callTurn = vi.fn<(request: ToolTurnRequest) => Promise<ToolTurnResult>>(request => {
    requests.push({ ...request, messages: [...request.messages] })
    const next = queue.shift()
    if (!next) throw new Error('unexpected extra turn')
    return Promise.resolve(next)
  })
  const searchTopics = vi.fn<SearchTopics>(() =>
    Promise.resolve((options.hits ?? []).map(hit => ({ ...hit, slug: hit.name }))),
  )
  const result = runAutotaggerAgentLoop({
    input: 'content',
    tools: buildAutotaggerAgentTools(CANDIDATES),
    candidateIds: CANDIDATES,
    bounds: options.bounds ?? BOUNDS,
    search: searchTopics,
    callTurn,
  })
  return { result, callTurn, requests, searchTopics }
}

describe('runAutotaggerAgentLoop', () => {
  it('answers on the first valid submission and reports the candidate ids', async () => {
    const { result, callTurn } = run([makeToolTurnResult([submit(CANDIDATES[0]!)])])
    await expect(result).resolves.toEqual({
      topicIds: [CANDIDATES[0]],
      end: 'submitted',
      turns: 1,
      toolCalls: 0,
    })
    expect(callTurn).toHaveBeenCalledTimes(1)
  })

  it('answers with no topics when it submits an empty list', async () => {
    const { result } = run([makeToolTurnResult([submit()])])
    await expect(result).resolves.toMatchObject({ topicIds: [], end: 'submitted' })
  })

  it('feeds a search result back, then accepts the submission', async () => {
    const { result, requests, searchTopics } = run(
      [makeToolTurnResult([search('rust')]), makeToolTurnResult([submit(CANDIDATES[1]!)])],
      { hits: [{ id: CANDIDATES[1]!, name: 'Rust' }] },
    )
    await expect(result).resolves.toMatchObject({
      topicIds: [CANDIDATES[1]],
      turns: 2,
      toolCalls: 1,
    })
    expect(searchTopics).toHaveBeenCalledWith('rust')
    const lastTurn = requests[1]!.messages.at(-1)!
    expect(lastTurn).toMatchObject({ role: 'tool', results: [{ isError: false }] })
    expect(JSON.stringify(lastTurn)).toContain('\\"candidate\\":true')
  })

  it('rejects an id outside the candidates and lets the model try again', async () => {
    const { result, requests } = run([
      makeToolTurnResult([submit('33333333-3333-4333-8333-333333333333')]),
      makeToolTurnResult([submit(CANDIDATES[0]!)]),
    ])
    await expect(result).resolves.toMatchObject({ topicIds: [CANDIDATES[0]], turns: 2 })
    expect(requests[1]!.messages.at(-1)).toMatchObject({
      role: 'tool',
      results: [{ isError: true, content: expect.stringContaining('candidate list') }],
    })
  })

  it('returns an error for an unknown tool and keeps going', async () => {
    const { result, requests } = run([
      makeToolTurnResult([{ name: 'delete_everything', input: {} }]),
      makeToolTurnResult([submit()]),
    ])
    await expect(result).resolves.toMatchObject({ end: 'submitted', turns: 2 })
    expect(requests[1]!.messages.at(-1)).toMatchObject({
      results: [{ isError: true, content: 'Unknown tool delete_everything.' }],
    })
  })

  it('stops with no topics after the turn bound without a submission', async () => {
    const { result, callTurn } = run(
      [
        makeToolTurnResult([search('a')]),
        makeToolTurnResult([search('b')]),
        makeToolTurnResult([search('c')]),
      ],
      { bounds: { ...BOUNDS, maxTurns: 3, maxToolCalls: 9 } },
    )
    await expect(result).resolves.toEqual({
      topicIds: [],
      end: 'turns-exhausted',
      turns: 3,
      toolCalls: 3,
    })
    expect(callTurn).toHaveBeenCalledTimes(3)
  })

  it('refuses searches past the tool call bound and tells the model to submit', async () => {
    const { result, requests, searchTopics } = run(
      [
        makeToolTurnResult([search('a')]),
        makeToolTurnResult([search('b')]),
        makeToolTurnResult([search('c')]),
        makeToolTurnResult([submit()]),
      ],
      { bounds: { ...BOUNDS, maxToolCalls: 2 } },
    )
    await expect(result).resolves.toMatchObject({ end: 'submitted', toolCalls: 2 })
    expect(searchTopics).toHaveBeenCalledTimes(2)
    expect(requests[3]!.messages.at(-1)).toMatchObject({
      results: [{ isError: true, content: expect.stringContaining('submit_topics') }],
    })
  })

  it('caps each turn at the output tokens left and stops when none are', async () => {
    const turn = (outputTokens: number) =>
      makeToolTurnResult([search(`q${outputTokens}`)], {
        usage: {
          inputTokens: 1,
          cacheReadTokens: 0,
          cacheWrite5mTokens: 0,
          cacheWrite1hTokens: 0,
          outputTokens,
          reasoningOutputTokens: 0,
        },
      })
    const { result, requests } = run([turn(60), turn(40)], {
      bounds: { maxTurns: 5, maxToolCalls: 9, maxOutputTokens: 100 },
    })
    await expect(result).resolves.toMatchObject({ topicIds: [], end: 'output-budget-exhausted' })
    expect(requests.map(request => request.maxOutputTokens)).toEqual([100, 40])
  })

  it('stops with no topics when the model repeats the same calls', async () => {
    const { result, callTurn } = run([
      makeToolTurnResult([search('same')]),
      makeToolTurnResult([search('same')]),
    ])
    await expect(result).resolves.toMatchObject({ topicIds: [], end: 'stalled', turns: 2 })
    expect(callTurn).toHaveBeenCalledTimes(2)
  })

  it('stops before a turn once the run deadline has passed', async () => {
    const deadline = new AbortController()
    const queue = [makeToolTurnResult([search('a')]), makeToolTurnResult([submit()])]
    const callTurn = vi.fn<(request: ToolTurnRequest) => Promise<ToolTurnResult>>(() => {
      deadline.abort()
      return Promise.resolve(queue.shift()!)
    })

    await expect(
      runAutotaggerAgentLoop({
        input: 'content',
        tools: buildAutotaggerAgentTools(CANDIDATES),
        candidateIds: CANDIDATES,
        bounds: BOUNDS,
        search: () => Promise.resolve([]),
        callTurn,
        signal: deadline.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(callTurn).toHaveBeenCalledTimes(1)
  })

  it('propagates a failed turn without swallowing it', async () => {
    await expect(
      runAutotaggerAgentLoop({
        input: 'content',
        tools: [],
        candidateIds: CANDIDATES,
        bounds: BOUNDS,
        search: () => Promise.resolve([]),
        callTurn: () => Promise.reject(new Error('provider down')),
      }),
    ).rejects.toThrow('provider down')
  })
})
