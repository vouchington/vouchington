import assert from 'http-assert'
import type { CommunityApplicationQuestion } from '../types.mts'

export type PreparedApplicationAnswer = {
  questionId: string
  fieldType: CommunityApplicationQuestion['field_type']
  isNull: boolean
  textValue: string | null
  booleanValue: boolean | null
  optionLabels: string[]
}

export function prepareApplicationAnswers(
  questions: CommunityApplicationQuestion[],
  answers: unknown,
): PreparedApplicationAnswer[] {
  assert(isAnswerRecord(answers), 422, 'answers must be an object')
  const questionsById = new Map(questions.map(question => [question.id, question]))
  for (const questionId of Object.keys(answers)) {
    assert(questionsById.has(questionId), 422, 'Unknown question')
  }

  const prepared: PreparedApplicationAnswer[] = []
  for (const question of questions) {
    if (!Object.hasOwn(answers, question.id) || answers[question.id] === undefined) {
      assert(!question.required, 422, `Answer required for question: ${question.question}`)
      continue
    }
    prepared.push(prepareAnswer(question, answers[question.id]))
  }
  return prepared
}

function prepareAnswer(
  question: CommunityApplicationQuestion,
  answer: unknown,
): PreparedApplicationAnswer {
  if (question.required) {
    assert(
      !isEmptyAnswer(question, answer),
      422,
      `Answer required for question: ${question.question}`,
    )
  }
  if (answer === null) return emptyPrepared(question, true)

  if (question.field_type === 'short_text' || question.field_type === 'long_text') {
    assert(typeof answer === 'string', 422, `Expected string for question: ${question.question}`)
    return { ...emptyPrepared(question, false), textValue: answer }
  }
  if (question.field_type === 'checkbox') {
    assert(
      typeof answer === 'boolean',
      422,
      `Expected boolean for checkbox question: ${question.question}`,
    )
    return { ...emptyPrepared(question, false), booleanValue: answer }
  }
  if (question.field_type === 'single_select') {
    assert(typeof answer === 'string', 422, `Expected string for question: ${question.question}`)
    assert(question.options?.includes(answer), 422, 'Unknown option')
    return { ...emptyPrepared(question, false), optionLabels: [answer] }
  }

  assert(
    Array.isArray(answer),
    422,
    `Expected array for multi_select question: ${question.question}`,
  )
  const optionLabels: string[] = []
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
    optionLabels.push(label)
  }
  return { ...emptyPrepared(question, false), optionLabels }
}

function emptyPrepared(
  question: CommunityApplicationQuestion,
  isNull: boolean,
): PreparedApplicationAnswer {
  return {
    questionId: question.id,
    fieldType: question.field_type,
    isNull,
    textValue: null,
    booleanValue: null,
    optionLabels: [],
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
