import { randomUUID } from 'node:crypto'
import { buildAutotaggerAgentInput } from '../agents/autotagger/agent-instructions.mts'
import { buildAutotaggerAgentTools } from '../agents/autotagger/agent-tools.mts'
import {
  buildPostClassifierState,
  buildRssFeedItemClassifierState,
} from '../agents/autotagger/content.mts'
import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'

/** What the production autotagger agent is given for a golden fixture's synthetic candidate slate. */
export async function prepareAutotaggerAgentFixture(fixture: ClassifierGoldenFixture) {
  if (typeof fixture.candidateSlate === 'string') {
    throw new Error(`Fixture ${fixture.id} must declare its synthetic candidate slate.`)
  }
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
  return {
    candidates,
    candidateIds,
    input: await buildAutotaggerAgentInput({ state, appliedTopicNames: [], candidates }),
    tools: buildAutotaggerAgentTools(candidateIds),
  }
}
