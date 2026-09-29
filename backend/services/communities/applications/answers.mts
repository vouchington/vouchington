import assert from 'http-assert'
import type { CommunityApplicationQuestion } from '../types.mts'

export function assertApplicationAnswers(
  questions: CommunityApplicationQuestion[],
  answers: unknown,
): void {
  assert(isAnswerRecord(answers), 422, 'answers must be an object')
  const questionsById = new Map(questions.map(question => [question.id, question]))
  for (const questionId of Object.keys(answers)) {
    assert(questionsById.has(questionId), 422, 'Unknown question')
  }

  for (const question of questions) {
    if (!Object.hasOwn(answers, question.id) || answers[question.id] === undefined) {
      assert(!question.required, 422, `Answer required for question: ${question.question}`)
      continue
    }
    assertAnswer(question, answers[question.id])
  }
}

function assertAnswer(question: CommunityApplicationQuestion, answer: unknown): void {
  if (question.required) {
    assert(
      !isEmptyAnswer(question, answer),
      422,
      `Answer required for question: ${question.question}`,
    )
  }
  if (answer === null) return

  if (question.field_type === 'short_text' || question.field_type === 'long_text') {
    assert(typeof answer === 'string', 422, `Expected string for question: ${question.question}`)
    return
  }
  if (question.field_type === 'checkbox') {
    assert(
      typeof answer === 'boolean',
      422,
      `Expected boolean for checkbox question: ${question.question}`,
    )
    return
  }
  if (question.field_type === 'single_select') {
    assert(typeof answer === 'string', 422, `Expected string for question: ${question.question}`)
    assert(question.options?.includes(answer), 422, 'Unknown option')
    return
  }

  assert(
    Array.isArray(answer),
    422,
    `Expected array for multi_select question: ${question.question}`,
  )
  const seen = new Set<string>()
  for (const label of answer) {
    assert(
      typeof label === 'string',
      422,
      `Expected string options for multi_select question: ${question.question}`,
    )
    assert(question.options?.includes(label), 422, 'Unknown option')
    assert(!seen.has(label), 422, 'Duplicate option')
    seen.add(label)
  }
}

function isEmptyAnswer(question: CommunityApplicationQuestion, answer: unknown): boolean {
  return (
    answer === null ||
    answer === '' ||
    (question.field_type === 'multi_select' && Array.isArray(answer) && answer.length === 0)
  )
}

function isAnswerRecord(answers: unknown): answers is Record<string, unknown> {
  return answers !== null && typeof answers === 'object' && !Array.isArray(answers)
}
