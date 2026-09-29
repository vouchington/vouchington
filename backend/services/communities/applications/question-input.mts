import assert from 'http-assert'

const VALID_FIELD_TYPES = [
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'checkbox',
] as const

type ApplicationQuestionFieldType = (typeof VALID_FIELD_TYPES)[number]
const VALID_FIELD_TYPES_SET: ReadonlySet<string> = new Set(VALID_FIELD_TYPES)

export type ApplicationQuestionInput = {
  question: string
  field_type: ApplicationQuestionFieldType
  options?: string[] | null
  required?: boolean
}

export function assertApplicationQuestionInputs(questions: ApplicationQuestionInput[]): void {
  for (const question of questions) {
    assert(
      question.question && question.question.trim() === question.question,
      422,
      'Question must not have leading or trailing whitespace',
    )
    assert(
      question.question.length >= 1 && question.question.length <= 500,
      422,
      'Question must be between 1 and 500 characters',
    )
    assert(
      VALID_FIELD_TYPES_SET.has(question.field_type),
      422,
      `Invalid field_type: ${question.field_type}`,
    )

    const requiresOptions =
      question.field_type === 'single_select' || question.field_type === 'multi_select'
    if (requiresOptions) {
      assert(
        Array.isArray(question.options) && question.options.length > 0,
        422,
        'select field types require options',
      )
      for (const label of question.options) {
        assert(
          typeof label === 'string' &&
            label.trim() === label &&
            label.length >= 1 &&
            label.length <= 500,
          422,
          'Options must be strings between 1 and 500 characters without surrounding whitespace',
        )
      }
      assert(
        new Set(question.options).size === question.options.length,
        422,
        'Option labels must be unique',
      )
    } else {
      assert(
        question.options === undefined || question.options === null,
        422,
        'Only select fields accept options',
      )
    }
  }
}
