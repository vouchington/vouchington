import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { Stream } from 'openai/core/streaming'
import type { Response, ResponseStreamEvent } from 'openai/resources/responses/responses'
import { makeSdkResponse, makeStreamEvent } from './modules/openai-utils/responses.mts'

const TITLE_AGENT_SLUG = 'chat-generate-title'

type TitleResponseRegistration = {
  response_id: string
  agent_slug: string
  lease_token: string
}

/** Reads the committed primary registration for this fixture's unique response id. */
export async function readTitleResponseRegistration(
  responseId: string,
): Promise<TitleResponseRegistration | null> {
  const { rows } = await write<TitleResponseRegistration>(sql`/* readTitleResponseRegistration */
    SELECT response_id, agent_slug, lease_token
    FROM openai_background_responses
    WHERE response_id = ${responseId} AND agent_slug = ${TITLE_AGENT_SLUG}
  `)
  return rows[0] ?? null
}

/** A real SDK stream that observes the production lease after its created event is consumed. */
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

/** Call only after all fixture provider/title operations and their owned leases have settled. */
export async function deleteTitleResponseFixture(responseId: string): Promise<void> {
  await using query = await beginTransaction()
  // The response-key FK cascades from the exact ledger row; unrelated provider keys are retained.
  await query(sql`/* deleteTitleResponseFixture.ledger */
    DELETE FROM ai_usage_records record
    USING ai_usage_provider_response_keys key
    WHERE record.id = key.ai_usage_record_id
      AND key.response_id = ${responseId}
      AND record.agent_slug = ${TITLE_AGENT_SLUG}
  `)
  await query(sql`/* deleteTitleResponseFixture.registration */
    DELETE FROM openai_background_responses
    WHERE response_id = ${responseId} AND agent_slug = ${TITLE_AGENT_SLUG}
  `)
  await query.commit()
}
