import { describe, it, expect } from 'vitest'
import { parseInboundActivity } from './parse-activity.mts'

function bodyOf(value: unknown): Buffer {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
}

describe('parseInboundActivity', () => {
  it('parses a valid activity', () => {
    const activity = parseInboundActivity(
      bodyOf({
        id: 'https://remote.example/activities/1',
        type: 'Follow',
        actor: 'https://remote.example/users/alice',
        object: 'https://voucha.test/ap/users/some-user',
      }),
    )

    expect(activity).toEqual({
      id: 'https://remote.example/activities/1',
      type: 'Follow',
      actor: 'https://remote.example/users/alice',
      object: 'https://voucha.test/ap/users/some-user',
    })
  })

  it('passes through a non-string object field untyped', () => {
    const activity = parseInboundActivity(
      bodyOf({
        id: 'https://remote.example/activities/1',
        type: 'Undo',
        actor: 'https://remote.example/users/alice',
        object: { type: 'Follow', object: 'https://voucha.test/ap/users/some-user' },
      }),
    )

    expect(activity.object).toEqual({
      type: 'Follow',
      object: 'https://voucha.test/ap/users/some-user',
    })
  })

  it('throws 400 on malformed JSON', () => {
    expect(() => parseInboundActivity(bodyOf('not json'))).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })

  it('throws 400 when the body is not a JSON object', () => {
    expect(() => parseInboundActivity(bodyOf(['Follow']))).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })

  it('throws 400 when id is missing', () => {
    expect(() =>
      parseInboundActivity(bodyOf({ type: 'Follow', actor: 'https://remote.example/users/alice' })),
    ).toThrow(expect.objectContaining({ status: 400 }))
  })

  it('throws 400 when type is an empty string', () => {
    expect(() =>
      parseInboundActivity(
        bodyOf({
          id: 'https://remote.example/activities/1',
          type: '',
          actor: 'https://remote.example/users/alice',
        }),
      ),
    ).toThrow(expect.objectContaining({ status: 400 }))
  })

  it('throws 400 when actor is missing', () => {
    expect(() =>
      parseInboundActivity(bodyOf({ id: 'https://remote.example/activities/1', type: 'Follow' })),
    ).toThrow(expect.objectContaining({ status: 400 }))
  })
})
