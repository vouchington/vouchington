import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT,
  activityPubInboxDeliveryTransitions,
} from './durable-delivery-transitions.mts'
import { buildExpireActivityPubInboxDeliveriesQuery } from './durable-delivery-expiry.mts'

describe('ActivityPub inbox transition implementation contract', () => {
  it('attaches the exact lifecycle contract entry to every callable transition', () => {
    expect({
      accept: activityPubInboxDeliveryTransitions.accept.contract,
      'acknowledge-enqueue': activityPubInboxDeliveryTransitions.acknowledgeEnqueue.contract,
      claim: activityPubInboxDeliveryTransitions.claim.contract,
      verify: activityPubInboxDeliveryTransitions.verify.contract,
      'admit-sender': activityPubInboxDeliveryTransitions.admitSender.contract,
      defer: activityPubInboxDeliveryTransitions.defer.contract,
      release: activityPubInboxDeliveryTransitions.release.contract,
      exhaust: activityPubInboxDeliveryTransitions.exhaust.contract,
      expire: activityPubInboxDeliveryTransitions.expire.contract,
      reject: activityPubInboxDeliveryTransitions.reject.contract,
      complete: activityPubInboxDeliveryTransitions.complete.contract,
      recover: activityPubInboxDeliveryTransitions.recover.contract,
      rearm: activityPubInboxDeliveryTransitions.rearm.contract,
    }).toEqual(ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT)
  })

  it('keeps transition SQL on the primary write boundary and effects outside SQL modules', async () => {
    const implementationFiles = [
      'durable-delivery-transition-intake.mts',
      'durable-delivery-transition-checkpoints.mts',
      'durable-delivery-transition-finalization.mts',
      'durable-delivery-transition-recovery.mts',
      'durable-delivery-expiry.mts',
    ] as const

    for (const implementationFile of implementationFiles) {
      const source = await readFile(new URL(implementationFile, import.meta.url), 'utf8')
      expect(source).toContain("from '@data-stores/psql'")
      expect(source).toMatch(/\bwrite(?:<[^>]+>)?\s*\(/)
      expect(source).not.toMatch(/\bread(?:<[^>]+>)?\s*\(/)
      expect(source).not.toContain('@queues/')
      expect(source).not.toMatch(/\benqueue[A-Z]/)
    }
  })

  it.each([0, 1.5, 501])('rejects an invalid cleanup batch limit of %s', limit => {
    expect(() => buildExpireActivityPubInboxDeliveriesQuery('unverified', limit)).toThrow(
      'ActivityPub inbox cleanup limit must be an integer from 1 to 500',
    )
  })
})
