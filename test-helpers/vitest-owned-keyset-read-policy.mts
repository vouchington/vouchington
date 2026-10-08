import type { SharedDbScopeEvent } from '../backend/data-stores/psql/shared-db-scope-observer.mts'

export type OwnedEmailQueueKeyset = {
  actorId: string
  id: string
  timestamp: string
  afterId: string
}

type Read = { event: SharedDbScopeEvent; completed: boolean }
type Registration = {
  owner: string
  fixture: OwnedEmailQueueKeyset
  reads: Map<symbol, Read>
  reportFailure: (event: SharedDbScopeEvent, message: string) => void
}

/** A cursor admits a read only provisionally; the committed first row must prove ownership. */
export class OwnedKeysetReadPolicy {
  private readonly registrations = new Set<Registration>()

  register(
    owner: string,
    fixture: OwnedEmailQueueKeyset,
    reportFailure: Registration['reportFailure'],
  ): () => void {
    if (!owner || !isImmediatePredecessor(fixture.afterId, fixture.id)) {
      throw new Error('An owned keyset requires an active test and its immediate UUID predecessor')
    }
    const registration: Registration = { owner, fixture, reads: new Map(), reportFailure }
    this.registrations.add(registration)
    return () => {
      if (!this.registrations.delete(registration)) return
      const unfinished = [...registration.reads.values()].filter(read => !read.completed)
      for (const { event } of unfinished) {
        reportFailure(
          event,
          'Owned keyset read did not complete with its committed owned first row',
        )
      }
      if (unfinished.length) throw new Error('Owned keyset read did not complete')
    }
  }

  observe(event: SharedDbScopeEvent, owner: string): boolean {
    if (
      event.operation !== 'searchCopyrightStaffEmailIntakes' ||
      event.table !== 'copyright_notice_email_intakes' ||
      event.scope.kind !== 'global' ||
      !event.keysetRead
    )
      return false
    const read = event.keysetRead
    if (read.phase === 'start') {
      const registration = [...this.registrations].find(
        ({ owner: registeredOwner, fixture }) =>
          registeredOwner === owner &&
          fixture.actorId === read.actorId &&
          fixture.timestamp === read.after?.timestamp &&
          fixture.afterId === read.after.id,
      )
      if (!registration || read.limit !== 1 || read.sqlLimit !== 2) return false
      if ([...this.registrations].some(entry => entry.reads.has(read.identity))) {
        throw new Error('Owned keyset query identity was reused')
      }
      registration.reads.set(read.identity, { event, completed: false })
      return true
    }
    const registration = [...this.registrations].find(
      entry => entry.owner === owner && entry.reads.has(read.identity),
    )
    if (!registration) throw new Error('Owned keyset completion has no matching admission')
    const admitted = registration.reads.get(read.identity)!
    if (admitted.completed) throw new Error('Owned keyset query completed twice')
    if (
      !Number.isInteger(read.rowCount) ||
      read.rowCount < 1 ||
      read.rowCount > 2 ||
      read.first?.id !== registration.fixture.id ||
      read.first.timestamp !== registration.fixture.timestamp
    )
      throw new Error('Committed keyset result did not prove its owned first row and bound')
    admitted.completed = true
    return true
  }
}

function isImmediatePredecessor(after: string, id: string): boolean {
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
  return (
    uuid.test(after) &&
    uuid.test(id) &&
    BigInt(`0x${after.replaceAll('-', '')}`) + 1n === BigInt(`0x${id.replaceAll('-', '')}`)
  )
}

const policyKey = Symbol.for('voucha.vitest-owned-keyset-read-policy')
const host = globalThis as unknown as Record<symbol, OwnedKeysetReadPolicy | undefined>
host[policyKey] ??= new OwnedKeysetReadPolicy()
export const ownedKeysetReadPolicy = host[policyKey]
