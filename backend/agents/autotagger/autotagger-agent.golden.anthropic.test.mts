import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { generateToolTurn } from '@modules/model-providers/tool-turn'
import type { ToolTurnRequest } from '@modules/model-providers/tool-turn-types'
import { TEST_MODEL_SELECTION } from '@voucha/test-helpers/agents/model-call-result'
import { autotaggerGoldenFixtures } from '@voucha/test-helpers/classifier-golden-fixtures'
import {
  unexpectedClassifierGoldenBand,
  type ClassifierGoldenFixture,
} from '@voucha/test-helpers/classifier-golden-set'
import { buildAutotaggerAgentInput } from './agent-instructions.mts'
import { runAutotaggerAgentLoop } from './agent-loop.mts'
import { buildAutotaggerAgentTools } from './agent-tools.mts'
import { buildPostClassifierState, buildRssFeedItemClassifierState } from './content.mts'

// Facts have no probability: a reported candidate sits above any upper threshold, an unreported
// one below any lower threshold, so the shared golden bands judge the agent's answers too.
const FACT_THRESHOLDS = { lower: 0.25, upper: 0.75 }
const MINIMUM_FIXTURES_PER_CANDIDATE = 3
const TOLERATED_UNEXPECTED_PER_CANDIDATE = 1
const CONCURRENT_FIXTURES = 4

type FixtureOutcome = {
  ended: string
  costMicrounits: number
  candidates: { name: string; mismatch: string | null }[]
}

async function runFixture(fixture: ClassifierGoldenFixture): Promise<FixtureOutcome> {
  if (typeof fixture.candidateSlate === 'string')
    throw new Error(`Fixture ${fixture.id} must declare its synthetic candidate slate.`)
  const candidates = fixture.candidateSlate.map(name => ({ topicId: randomUUID(), name }))
  const candidateIds = candidates.map(candidate => candidate.topicId)
  const state =
    fixture.subjectKind === 'post'
      ? await buildPostClassifierState({
          title: 'Synthetic autotagger regression fixture',
          markdown: fixture.state,
        } as Parameters<typeof buildPostClassifierState>[0])
      : await buildRssFeedItemClassifierState({
          data: { title: 'Synthetic airport lounge review', content: fixture.state },
        } as Parameters<typeof buildRssFeedItemClassifierState>[0])
  let costMicrounits = 0
  const billedTurn = async (request: ToolTurnRequest) => {
    const turn = await generateToolTurn(TEST_MODEL_SELECTION, request, {
      openaiTransport: 'openrouter',
    })
    costMicrounits += calcCostMicrounits('anthropic', turn.model, turn.serviceTier, turn.usage) ?? 0
    return turn
  }
  const result = await runAutotaggerAgentLoop({
    input: await buildAutotaggerAgentInput({ state, appliedTopicNames: [], candidates }),
    tools: buildAutotaggerAgentTools(candidateIds),
    candidateIds,
    bounds: { maxTurns: 6, maxToolCalls: 8, maxOutputTokens: 3000 },
    search: query =>
      Promise.resolve(
        candidates
          .filter(candidate => candidate.name.toLowerCase().includes(query.toLowerCase()))
          .map(candidate => ({
            id: candidate.topicId,
            name: candidate.name,
            slug: candidate.name,
          })),
      ),
    callTurn: billedTurn,
  })
  return {
    ended: result.end,
    costMicrounits,
    candidates: candidates.map(candidate => ({
      name: candidate.name,
      mismatch: unexpectedClassifierGoldenBand(
        fixture,
        { key: candidate.name, thresholdRevision: 'facts', thresholds: FACT_THRESHOLDS },
        result.topicIds.includes(candidate.topicId) ? 1 : 0,
      ),
    })),
  }
}

// Real Anthropic calls (credentialed project `backend-anthropic`); fails without a credential.
describe('autotagger agent golden regression set on Anthropic Haiku 5.5', () => {
  it('reports the candidates the synthetic fixtures expect and no others', async () => {
    const outcomes: FixtureOutcome[] = []
    // A few at a time: the SDK does not retry, so a burst of requests could trip a rate limit.
    for (let start = 0; start < autotaggerGoldenFixtures.length; start += CONCURRENT_FIXTURES) {
      const chunk = autotaggerGoldenFixtures.slice(start, start + CONCURRENT_FIXTURES)
      outcomes.push(...(await Promise.all(chunk.map(runFixture))))
    }

    expect(outcomes.map(outcome => outcome.ended)).toEqual(outcomes.map(() => 'submitted'))
    expect(outcomes.reduce((sum, outcome) => sum + outcome.costMicrounits, 0)).toBeGreaterThan(0)
    const byCandidate = Map.groupBy(
      outcomes.flatMap(outcome => outcome.candidates),
      candidate => candidate.name,
    )
    for (const [name, results] of byCandidate) {
      const mismatches = results.flatMap(result => (result.mismatch ? [result.mismatch] : []))
      expect(results.length).toBeGreaterThanOrEqual(MINIMUM_FIXTURES_PER_CANDIDATE)
      expect({
        name,
        beyondTolerance: mismatches.slice(TOLERATED_UNEXPECTED_PER_CANDIDATE),
      }).toEqual({ name, beyondTolerance: [] })
    }
  }, 30_000)
})
