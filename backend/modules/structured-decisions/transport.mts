import { getLongRunningExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { fetch as undiciFetch, type Response } from 'undici'
import type {
  StructuredDecisionQuestion,
  StructuredDecisionRequest,
  StructuredDecisionTransport,
} from './types.mts'
const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'
const TYPESAFE_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone'
export type TransportRequest = {
  body: Record<string, unknown>
  headers: Record<string, string>
  provider: string
  url: string
}
export function createTransportRequest(
  transport: StructuredDecisionTransport,
  apiKey: string,
  request: StructuredDecisionRequest,
): TransportRequest {
  const questions = Object.fromEntries(
    request.questions.map(question => [question.id, toProviderQuestion(question)]),
  )
  if (transport === 'typesafe')
    return {
      url: TYPESAFE_SYSTEM_ONE_URL,
      provider: 'TypeSafe',
      headers: headers(apiKey),
      body: { model: 'jev-latest', state: request.state, questions },
    }
  return {
    url: OPENROUTER_DECISIONS_URL,
    provider: 'OpenRouter',
    headers: headers(apiKey),
    body: {
      model: 'typesafe/jev-1.13',
      state: request.state,
      questions,
      provider: { only: ['TypeSafe'], allow_fallbacks: false },
    },
  }
}
function headers(apiKey: string): Record<string, string> {
  return { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }
}
function toProviderQuestion(question: StructuredDecisionQuestion): Record<string, unknown> {
  if (question.type === 'noul')
    return { type: 'noul', instructions: question.question, criteria: { false: 'No', true: 'Yes' } }
  if (question.type === 'choice')
    return {
      type: 'choice',
      instructions: question.question,
      criteria: Object.fromEntries(question.criteria.map(value => [value, value])),
    }
  return {
    type: 'score',
    instructions: question.question,
    criteria: question.criteria.map(criterion => criterion.description),
  }
}
/* no-mistakes: integration=typesafe */
/* no-mistakes: integration=openrouter */
export async function fetchStructuredDecisionProvider(
  url: string,
  init: Parameters<typeof undiciFetch>[1],
): Promise<Response> {
  return undiciFetch(url, {
    ...init,
    dispatcher: getLongRunningExternalRequestDispatcher(),
  })
}
