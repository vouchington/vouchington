import { StructuredDecisionError, type StructuredDecisionRequest } from './types.mts'
export function validateRequest(request: StructuredDecisionRequest): void {
  const raw: unknown = request
  if (!record(raw) || !nonEmptyString(raw.state) || !Array.isArray(raw.questions))
    invalid('State and a question array are required.')
  if (raw.questions.length === 0) invalid('At least one question is required.')
  const ids = new Set<string>()
  for (const question of raw.questions) {
    if (
      !record(question) ||
      !nonEmptyString(question.id) ||
      !nonEmptyString(question.question) ||
      ids.has(question.id)
    )
      invalid('Question IDs and prompts must be unique and non-empty.')
    ids.add(question.id)
    if (question.type === 'noul') continue
    if (question.type === 'choice') {
      validateChoice(question.criteria)
      continue
    }
    if (question.type === 'score') {
      validateScore(question.criteria)
      continue
    }
    invalid('Question type must be noul, choice, or score.')
  }
}
function validateChoice(raw: unknown): void {
  if (
    !Array.isArray(raw) ||
    raw.length < 2 ||
    raw.some(value => !nonEmptyString(value)) ||
    new Set(raw).size !== raw.length
  )
    invalid('Choice criteria must contain at least two unique non-empty values.')
}
function validateScore(raw: unknown): void {
  if (
    !Array.isArray(raw) ||
    raw.length < 2 ||
    raw.some(
      (criterion, index) =>
        !record(criterion) || criterion.value !== index || !nonEmptyString(criterion.description),
    )
  )
    invalid('Score criteria must be consecutive, non-empty levels starting at zero.')
  const descriptions = raw.map(criterion => (record(criterion) ? criterion.description : undefined))
  if (new Set(descriptions).size !== descriptions.length)
    invalid('Score criterion descriptions must be unique.')
}
function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function invalid(message: string): never {
  throw new StructuredDecisionError('invalid-request', message)
}
