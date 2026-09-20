import {
  StructuredDecisionError,
  type StructuredDecisionAnswer,
  type StructuredDecisionQuestion,
  type StructuredDecisionRequest,
  type StructuredDecisionResult,
  type StructuredDecisionTransport,
} from './types.mts'
const TOLERANCE = 0.0001
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
function decodeAnswer(
  raw: unknown,
  question: StructuredDecisionQuestion,
): StructuredDecisionAnswer {
  if (!record(raw) || raw.id !== question.id || raw.type !== question.type)
    invalid('Provider answer type does not match the requested question.')
  if (question.type === 'noul')
    return { id: question.id, type: 'noul', probability: probability(raw.noul) }
  const confidence = probability(raw.confidence)
  if (question.type === 'choice') {
    if (typeof raw.choice !== 'string' || !question.criteria.includes(raw.choice))
      invalid('Provider choice is not one of the requested criteria.')
    return {
      id: question.id,
      type: 'choice',
      choice: raw.choice,
      confidence,
      probabilities: probabilities(raw.probabilities, question.criteria),
    }
  }
  if (
    typeof raw.score !== 'number' ||
    !Number.isFinite(raw.score) ||
    raw.score < 0 ||
    raw.score > question.criteria.length - 1
  )
    invalid('Provider score answer is invalid.')
  const legend = scoreLegend(
    raw.legend,
    question.criteria.map(criterion => criterion.description),
  )
  const indexKeys = legend.map((_, index) => String(index))
  const rawProbabilities = raw.probabilities
  const keys =
    record(rawProbabilities) && legend.every(key => Object.hasOwn(rawProbabilities, key))
      ? legend
      : indexKeys
  return {
    id: question.id,
    type: 'score',
    score: raw.score,
    confidence,
    legend,
    probabilities: probabilities(rawProbabilities, keys),
  }
}
function scoreLegend(raw: unknown, expected: readonly string[]): string[] {
  if (record(raw) && Object.keys(raw).length !== expected.length)
    invalid('Provider score legend does not match the requested criteria.')
  const legend = Array.isArray(raw)
    ? raw
    : record(raw)
      ? expected.map((_, index) => raw[String(index)])
      : []
  if (legend.length !== expected.length || legend.some((value, index) => value !== expected[index]))
    invalid('Provider score legend does not match the requested criteria.')
  return legend as string[]
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
function probabilities(raw: unknown, keys: readonly string[]): Readonly<Record<string, number>> {
  if (
    !record(raw) ||
    Object.keys(raw).length !== keys.length ||
    keys.some(key => !Object.hasOwn(raw, key))
  )
    invalid('Provider probabilities do not match requested criteria.')
  const result = Object.fromEntries(keys.map(key => [key, probability(raw[key])])) as Record<
    string,
    number
  >
  if (Math.abs(Object.values(result).reduce((sum, value) => sum + value, 0) - 1) > TOLERANCE)
    invalid('Provider probabilities must sum to one.')
  return result
}
function probability(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
    invalid('Provider probability must be a finite value from zero through one.')
  return value
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function invalid(message: string): never {
  throw new StructuredDecisionError('invalid-response', message)
}
