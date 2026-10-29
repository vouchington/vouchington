import type { RequestInit } from 'undici'

/** One asked question in the Jev dialect's shape, whichever dialect the request was sent in. */
export type AskedQuestion = { type: string; criteria: Record<string, string> }

type OpenAIQuestion = {
  name: string
  type: string
  choices?: { value: string; description: string }[]
  levels?: { label: string; description: string }[]
}

type JevAnswer = Record<string, unknown> & { id: string; type: string }

/** The parsed body of a structured-decision provider request. */
function readBody(init: RequestInit | undefined): { questions: unknown } {
  const body = init?.body
  if (typeof body !== 'string') throw new Error('Expected a JSON string provider request body')
  return JSON.parse(body) as { questions: unknown }
}

/** Whether a provider request was sent in the OpenAI `/v1/decisions` dialect. */
export function isOpenAIDecisionRequest(init: RequestInit | undefined): boolean {
  return Array.isArray(readBody(init).questions)
}

/** The asked questions keyed by id, with OpenAI questions mapped onto the Jev shape. */
export function readAskedQuestions(init: RequestInit | undefined): Record<string, AskedQuestion> {
  const { questions } = readBody(init)
  if (!Array.isArray(questions)) return questions as Record<string, AskedQuestion>
  return Object.fromEntries(
    (questions as OpenAIQuestion[]).map(question => {
      const options = question.choices?.map(c => [c.value, c.description] as const)
      const levels = question.levels?.map(l => [l.label, l.description] as const)
      const type = question.type === 'predicate' ? 'noul' : question.type
      return [question.name, { type, criteria: Object.fromEntries(options ?? levels ?? []) }]
    }),
  )
}

function toOpenAIAnswer(answer: JevAnswer): Record<string, unknown> {
  const { id, type, ...rest } = answer
  if (type === 'noul') return { name: id, type: 'predicate', probability: answer.noul }
  if (type !== 'choice') throw new Error(`Unexpected answer type: ${type}`)
  const probabilities = Object.entries(rest.probabilities as Record<string, number>)
  return {
    name: id,
    type,
    choice: rest.choice,
    confidence: rest.confidence,
    probabilities: probabilities.map(([value, probability]) => ({ value, probability })),
  }
}

/**
 * A provider response body in the request's dialect, built from a Jev-shaped body. Jev bodies
 * default to TypeSafe's `typesafe/jev-1.13`; OpenAI reports no passthrough cost and always serves
 * `gpt-6-luna`, so those Jev fields are replaced.
 */
export function decisionResponseBody(
  init: RequestInit | undefined,
  body: { id: string; usage: Record<string, number>; answers: JevAnswer[] } & Record<
    string,
    unknown
  >,
): Record<string, unknown> {
  if (!isOpenAIDecisionRequest(init))
    return { model: 'typesafe/jev-1.13', provider: 'TypeSafe', ...body }
  const { cost: _cost, ...usage } = body.usage
  return {
    id: body.id,
    model: 'gpt-6-luna',
    usage,
    answers: body.answers.map(toOpenAIAnswer),
  }
}
