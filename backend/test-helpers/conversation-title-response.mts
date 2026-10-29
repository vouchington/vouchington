import { ai_agents } from '../queues/ai-agents/queues.mts'
import { backgroundResponseRecoveryJobId } from '../queues/ai-agents/enqueues/recover-background-response.mts'
import { Stream } from 'openai/core/streaming'
import type { Response, ResponseStreamEvent } from 'openai/resources/responses/responses'
import { makeSdkResponse, makeStreamEvent } from './modules/openai-utils/responses.mts'

const TITLE_AGENT_SLUG = 'chat-generate-title'

type TitleResponseRegistration = {
  response_id: string
  agent_slug: string
}

/** Reads this fixture's admitted delayed recovery job after the created event. */
export async function readTitleResponseRegistration(
  responseId: string,
): Promise<TitleResponseRegistration | null> {
  const job = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
  const response = job?.data.backgroundResponses?.find(item => item.responseId === responseId)
  if (!response || response.agentSlug !== TITLE_AGENT_SLUG) return null
  return { response_id: response.responseId, agent_slug: response.agentSlug }
}

/** A real SDK stream that observes the production registration after its created event is consumed. */
export function createTitleResponseStream(response: Response) {
  let registration: TitleResponseRegistration | null | undefined
  const controller = new AbortController()
  async function* events(): AsyncGenerator<ResponseStreamEvent> {
    yield makeStreamEvent({
      type: 'response.created',
      sequence_number: 1,
      response: makeSdkResponse({
        ...response,
        status: 'in_progress',
        output: [],
        output_text: '',
      }),
    })
    registration = await readTitleResponseRegistration(response.id)
    if (response.status === 'failed') {
      yield makeStreamEvent({ type: 'response.failed', sequence_number: 2, response })
    } else if (response.status === 'incomplete') {
      yield makeStreamEvent({ type: 'response.incomplete', sequence_number: 2, response })
    } else {
      yield makeStreamEvent({ type: 'response.completed', sequence_number: 2, response })
    }
  }
  return {
    stream: new Stream<ResponseStreamEvent>(events, controller),
    getRegistration: () => registration,
    dispose: () => controller.abort(),
  }
}

/** Call only after all fixture provider/title operations and their owned registrations have settled. */
export async function deleteTitleResponseFixture(responseId: string): Promise<void> {
  const job = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
  if (job) await job.remove()
}
