import { describe, expect, it } from 'vitest'
import type {
  SharedDbScopeEvent,
  SharedDbKeysetRead,
} from '../backend/data-stores/psql/shared-db-scope-observer.mts'
import { OwnedKeysetReadPolicy } from './vitest-owned-keyset-read-policy.mts'
import { rejectUnscopedSharedDbCall } from './vitest-shared-db-scope-violations.mts'

const fixture = {
  actorId: 'moderator-owned',
  id: '00000000-0000-0000-0000-000000000002',
  afterId: '00000000-0000-0000-0000-000000000001',
  timestamp: '2026-10-07T12:00:00.123000Z',
}
const owner = 'policy-file:owned-case'

function event(read: SharedDbKeysetRead): SharedDbScopeEvent {
  return {
    operation: 'searchCopyrightStaffEmailIntakes',
    table: 'copyright_notice_email_intakes',
    scope: { kind: 'global' },
    keysetRead: read,
  }
}

function start(identity = Symbol('query')): SharedDbScopeEvent {
  return event({
    phase: 'start',
    identity,
    actorId: fixture.actorId,
    after: { timestamp: fixture.timestamp, id: fixture.afterId },
    limit: 1,
    sqlLimit: 2,
  })
}

function completed(identity: symbol, rowCount = 2): SharedDbScopeEvent {
  return event({
    phase: 'completed',
    identity,
    rowCount,
    first: { id: fixture.id, timestamp: fixture.timestamp },
  })
}

function registered() {
  const policy = new OwnedKeysetReadPolicy()
  const failures: string[] = []
  const close = policy.register(owner, fixture, (_event, message) => failures.push(message))
  return { policy, failures, close }
}

describe('owned staff email keyset admission and committed-result proof', () => {
  it('allows an owned first row with an unasserted lookahead, then closes idempotently', () => {
    const { policy, failures, close } = registered()
    const identity = Symbol('owned-query')
    expect(policy.observe(start(identity), owner)).toBe(true)
    // Only the actual first row is disclosed to the policy; lookahead ownership is not asserted.
    expect(policy.observe(completed(identity), owner)).toBe(true)
    close()
    close()
    expect(failures).toEqual([])
    expect(policy.observe(start(), owner)).toBe(false)
  })

  it('allows an owned one-row page without requiring global absence', () => {
    const { policy, close } = registered()
    const identity = Symbol('one-row')
    expect(policy.observe(start(identity), owner)).toBe(true)
    expect(policy.observe(completed(identity, 1), owner)).toBe(true)
    expect(close).not.toThrow()
  })

  it.each([
    { actorId: 'another-moderator' },
    { after: { timestamp: '2026-10-07T12:00:00.124000Z', id: fixture.afterId } },
    { after: { timestamp: fixture.timestamp, id: fixture.id } },
    { after: undefined },
    { limit: 2 },
    { sqlLimit: 3 },
    { sqlLimit: '2' },
  ])('rejects mismatched actor, tuple or actual bounds: %j', change => {
    const { policy, close } = registered()
    const initial = start().keysetRead!
    expect(policy.observe(event({ ...initial, ...change }), owner)).toBe(false)
    expect(close).not.toThrow()
  })

  it('does not authorize a default global read or a cursor from another test', () => {
    const { policy, close } = registered()
    expect(policy.observe({ ...start(), keysetRead: undefined }, owner)).toBe(false)
    expect(policy.observe(start(), 'another-case')).toBe(false)
    expect(close).not.toThrow()
  })

  it('cannot authorize another operation, table or scope', () => {
    const { policy, close } = registered()
    expect(
      policy.observe({ ...start(), operation: 'listAvailableNotificationPushIntents' }, owner),
    ).toBe(false)
    expect(policy.observe({ ...start(), table: 'notification_push_intents' }, owner)).toBe(false)
    expect(
      policy.observe({ ...start(), scope: { kind: 'cursor', id: fixture.afterId } }, owner),
    ).toBe(false)
    expect(close).not.toThrow()
  })

  it.each([
    { rowCount: 0, first: undefined },
    { rowCount: 3 },
    { rowCount: 1.5 },
    { first: { id: '00000000-0000-0000-0000-000000000003', timestamp: fixture.timestamp } },
    { first: { id: fixture.id, timestamp: '2026-10-07T12:00:00.124000Z' } },
  ])('rejects a result lacking its exact owned first row and bound: %j', change => {
    const { policy, close, failures } = registered()
    const identity = Symbol('invalid-result')
    expect(policy.observe(start(identity), owner)).toBe(true)
    expect(() =>
      policy.observe(event({ ...completed(identity).keysetRead!, ...change }), owner),
    ).toThrow('owned first row')
    expect(close).toThrow('did not complete')
    expect(failures).toEqual([
      'Owned keyset read did not complete with its committed owned first row',
    ])
  })

  it('does not let an unrelated completion satisfy a pending query', () => {
    const { policy, close } = registered()
    expect(policy.observe(start(), owner)).toBe(true)
    expect(() => policy.observe(completed(Symbol('unrelated')), owner)).toThrow(
      'matching admission',
    )
    expect(close).toThrow('did not complete')
  })

  it('rejects reused identities and duplicate completions', () => {
    const { policy, close } = registered()
    const identity = Symbol('unique')
    expect(policy.observe(start(identity), owner)).toBe(true)
    expect(() => policy.observe(start(identity), owner)).toThrow('reused')
    expect(policy.observe(completed(identity), owner)).toBe(true)
    expect(() => policy.observe(completed(identity), owner)).toThrow('twice')
    expect(close).not.toThrow()
  })

  it('keeps missing-completion evidence after cleanup and cannot reuse a closed registration', () => {
    const { policy, close, failures } = registered()
    const identity = Symbol('failed-transaction')
    expect(policy.observe(start(identity), owner)).toBe(true)
    expect(close).toThrow('did not complete')
    close()
    expect(failures).toHaveLength(1)
    expect(() => policy.observe(completed(identity), owner)).toThrow('matching admission')
    expect(failures).toHaveLength(1)
  })

  it('correlates independent in-flight reads to their own registered fixtures', () => {
    const { policy, close } = registered()
    const other = {
      ...fixture,
      actorId: 'second-moderator',
      timestamp: '2026-10-07T13:00:00.123000Z',
    }
    const closeOther = policy.register(owner, other, () => {
      throw new Error('Unexpected missing completion')
    })
    const firstIdentity = Symbol('first')
    const secondIdentity = Symbol('second')
    expect(policy.observe(start(firstIdentity), owner)).toBe(true)
    expect(
      policy.observe(
        event({
          phase: 'start',
          identity: secondIdentity,
          actorId: other.actorId,
          after: { id: other.afterId, timestamp: other.timestamp },
          limit: 1,
          sqlLimit: 2,
        }),
        owner,
      ),
    ).toBe(true)
    expect(() => policy.observe(completed(secondIdentity), owner)).toThrow('owned first row')
    expect(policy.observe(completed(firstIdentity), owner)).toBe(true)
    expect(
      policy.observe(
        event({
          phase: 'completed',
          identity: secondIdentity,
          rowCount: 1,
          first: { id: other.id, timestamp: other.timestamp },
        }),
        owner,
      ),
    ).toBe(true)
    close()
    closeOther()
  })

  it('preserves explicit ID admission without adding a completion requirement', () => {
    expect(() =>
      rejectUnscopedSharedDbCall({
        operation: 'searchCopyrightStaffEmailIntakes',
        table: 'copyright_notice_email_intakes',
        scope: { kind: 'ids', ids: [fixture.id] },
      }),
    ).not.toThrow()
  })
})
