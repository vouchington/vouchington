import { describe, expect, it } from 'vitest'

import { isUniqueViolation } from './unique-violation.mts'

describe('isUniqueViolation', () => {
  it('matches a pg-style Error carrying SQLSTATE 23505', () => {
    const error = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'idx_topics__slug',
    })

    expect(isUniqueViolation(error)).toBe(true)
  })

  it('matches a plain object carrying SQLSTATE 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it.each([
    ['another SQLSTATE', Object.assign(new Error('fk'), { code: '23503' })],
    ['a numeric 23505', { code: 23505 }],
    ['an object without a code', { message: 'duplicate' }],
    ['an Error without a code', new Error('duplicate')],
    ['null', null],
    ['undefined', undefined],
    ['a string', '23505'],
    ['a number', 23505],
  ])('rejects %s', (_label, value) => {
    expect(isUniqueViolation(value)).toBe(false)
  })

  it('narrows the caught value so its constraint can be inspected safely', () => {
    const caught: unknown = { code: '23505', constraint: 'uq_user_landing_pages__user_id_slug' }

    const constraint =
      isUniqueViolation(caught) && 'constraint' in caught ? caught.constraint : null

    expect(constraint).toBe('uq_user_landing_pages__user_id_slug')
  })
})
