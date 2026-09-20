import type { fetch as undiciFetch, Response } from 'undici'
export type StructuredDecisionTransport = 'openrouter' | 'typesafe'
export type NoulQuestion = { id: string; type: 'noul'; question: string }
export type ChoiceQuestion = {
  id: string
  type: 'choice'
  question: string
  criteria: readonly string[]
}
export type ScoreCriterion = { description: string; value: number }
export type ScoreQuestion = {
  id: string
  type: 'score'
  question: string
  criteria: readonly ScoreCriterion[]
}
export type StructuredDecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion
export type StructuredDecisionRequest = {
  state: string
  questions: readonly StructuredDecisionQuestion[]
}
export type NoulAnswer = { id: string; type: 'noul'; probability: number }
export type ChoiceAnswer = {
  id: string
  type: 'choice'
  choice: string
  confidence: number
  probabilities: Readonly<Record<string, number>>
}
export type ScoreAnswer = {
  id: string
  type: 'score'
  score: number
  confidence: number
  legend: readonly string[]
  probabilities: Readonly<Record<string, number>>
}
export type StructuredDecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer
export type StructuredDecisionResult = {
  answers: readonly StructuredDecisionAnswer[]
  model: string
  provider: string
  raw: unknown
  usage: Readonly<Record<string, unknown>> | null
}
export type StructuredDecisionErrorCode = 'invalid-request' | 'invalid-response' | 'provider-error'
export class StructuredDecisionError extends Error {
  readonly code: StructuredDecisionErrorCode
  readonly status: number | undefined

  constructor(
    code: StructuredDecisionErrorCode,
    message: string,
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'StructuredDecisionError'
    this.code = code
    this.status = status
  }
}
export type StructuredDecisionFetch = (
  url: string,
  init: Parameters<typeof undiciFetch>[1],
) => Promise<Response>
export type StructuredDecisionSleep = (durationMs: number, signal?: AbortSignal) => Promise<void>
export type CreateStructuredDecisionClientOptions = {
  transport: StructuredDecisionTransport
  apiKey: string
  fetch?: StructuredDecisionFetch
  sleep?: StructuredDecisionSleep
}
export type StructuredDecisionClient = {
  decide(
    request: StructuredDecisionRequest,
    signal?: AbortSignal,
  ): Promise<StructuredDecisionResult>
}
