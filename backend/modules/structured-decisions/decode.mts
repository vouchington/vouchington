import {
  StructuredDecisionError,
  type StructuredDecisionRequest,
  type StructuredDecisionResult,
  type StructuredDecisionTransport,
} from './types.mts'
import { decodeAnswer } from './answer-decoder.mts'

export function decodeResult(
  raw: unknown,
  request: StructuredDecisionRequest,
  transport: StructuredDecisionTransport,
  fallbackProvider: string,
): StructuredDecisionResult {
  if (!record(raw) || typeof raw.model !== 'string')
    invalid('Provider response does not contain a valid decision envelope.')
  validateProviderIdentity(raw, transport)
  const entries = answerEntries(raw.answers)
  const answers = new Map<string, unknown>()
  for (const [id, answer] of entries) {
    if (!record(answer) || answers.has(id))
      invalid('Provider response contains invalid or duplicate answer IDs.')
    answers.set(id, { ...answer, id: typeof answer.id === 'string' ? answer.id : id })
  }
  if (answers.size !== request.questions.length)
    invalid('Provider response does not cover every requested question exactly once.')
  return {
    answers: request.questions.map(question => decodeAnswer(answers.get(question.id), question)),
    model: raw.model,
    provider: typeof raw.provider === 'string' ? raw.provider : fallbackProvider,
    raw,
    usage: record(raw.usage) ? raw.usage : null,
  }
}
function answerEntries(raw: unknown): Array<[string, unknown]> {
  if (Array.isArray(raw))
    return raw.map(answer => {
      if (!record(answer) || typeof answer.id !== 'string')
        invalid('Provider response contains an answer without an ID.')
      return [answer.id, answer]
    })
  if (record(raw)) return Object.entries(raw)
  invalid('Provider response does not contain answers.')
}
function validateProviderIdentity(
  raw: Record<string, unknown>,
  transport: StructuredDecisionTransport,
): void {
  const modelPattern =
    transport === 'openrouter'
      ? /^typesafe\/jev-1\.13(?:-[A-Za-z0-9.]+)?$/
      : /^(?:typesafe\/)?(?:jev-latest|jev-1\.13(?:\.0)?(?:-[A-Za-z0-9.]+)?)$/
  if (typeof raw.model !== 'string' || !modelPattern.test(raw.model))
    invalid('Provider response came from an unexpected model.')
  if (transport === 'openrouter' && raw.provider !== 'TypeSafe')
    invalid('OpenRouter response came from an unexpected provider.')
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function invalid(message: string): never {
  throw new StructuredDecisionError('invalid-response', message)
}
