import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidAfter } from '@voucha/test-helpers/uuid-before'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { emails } from '@queues/emails/queues'
import { notifications } from '@queues/notifications/queues'
import { createOutboundCopyrightCorrespondence } from '@services/copyright-notices/correspondence'
import { createCopyrightDeliveryIntent } from '@services/copyright-notices/delivery-intents'
import { copyrightSweepConfig } from '@services/copyright-notices/work-limits'
import type { CopyrightDeliveryReconcileData } from '@queues/notifications/types'
import {
  processDeliverCopyrightNotice,
  copyrightDeliveryReconcileProcessors as channels,
} from './copyright-delivery.mts'

const AFTER_EVERY_ROW = encodeUuidCursorBefore('ffffffff-ffff-ffff-ffff-ffffffffffff')

async function createNotice() {
  const claimant = await createTestUserDirect()
  const postId = await insertTestPost({
    title: `copyright delivery ${crypto.randomUUID()}`,
    slug: `copyright-delivery-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(claimant.id)
  const placementId = await insertTestPostImage({ postId, imageId })
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: 'private snapshot',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId,
        placementRevision: 1,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return { claimant, notice }
}

async function createInAppIntent() {
  const { claimant, notice } = await createNotice()
  return createCopyrightDeliveryIntent({
    noticeId: notice.id,
    submissionId: null,
    correspondenceId: null,
    recipientUserId: claimant.id,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'in_app',
    idempotencyKey: `copyright-in-app-${crypto.randomUUID()}`,
  })
}

async function createEmailIntent() {
  const { notice } = await createNotice()
  const correspondence = await createOutboundCopyrightCorrespondence({
    noticeId: notice.id,
    submissionId: null,
    correspondenceKind: 'receipt',
    compositionKind: 'deterministic_template',
    bodyCiphertext: `receipt-${crypto.randomUUID()}`,
    draftedById: null,
  })
  return createCopyrightDeliveryIntent({
    noticeId: notice.id,
    submissionId: null,
    correspondenceId: correspondence.id,
    recipientUserId: null,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_receipt',
    channel: 'email',
    idempotencyKey: `copyright-email-${crypto.randomUUID()}`,
    recipientEmail: `tests+copyright-delivery-${crypto.randomUUID()}@voucha.ai`,
  })
}

async function readJobsFor(queue: typeof notifications, intentId: string) {
  return (await readAllQueueJobs(queue))
    .filter(job => (job.data as { intentId?: string }).intentId === intentId)
    .map(job => ({ name: job.name, data: job.data as unknown }))
}

describe('copyright delivery reconcile channel jobs', () => {
  afterEach(() => vi.restoreAllMocks())

  it('bulk-enqueues each channel page on its own delivery job', async () => {
    overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
      in_app_batch_size: 1,
      in_app_max_batches_per_run: 2,
      email_batch_size: 1,
      email_max_batches_per_run: 2,
    })
    const inApp = await createInAppIntent()
    const email = await createEmailIntent()

    await expect(
      channels.in_app({ after: encodeUuidCursorBefore(inApp.id) }),
    ).resolves.toMatchObject({ enqueued: 1 })
    await expect(
      channels.email({ after: encodeUuidCursorBefore(email.id) }),
    ).resolves.toMatchObject({ enqueued: 1 })

    await expect(readJobsFor(notifications, inApp.id)).resolves.toEqual([
      { name: 'notifications.processDeliverCopyrightNotice', data: { intentId: inApp.id } },
    ])
    await expect(readJobsFor(emails, email.id)).resolves.toEqual([
      { name: 'processSendCopyrightNoticeEmail', data: { intentId: email.id } },
    ])
  })

  it('reports its cap and continues only its own channel', async () => {
    overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
      in_app_batch_size: 1,
      in_app_max_batches_per_run: 1,
    })
    const inApp = await createInAppIntent()
    // A later owned row guarantees the capped page has a next page.
    await createInAppIntent()
    const continuations: CopyrightDeliveryReconcileData[] = []
    const add = notifications.add
    vi.spyOn(notifications, 'add').mockImplementation((name, ...args) => {
      if (name.startsWith('notifications.processReconcileCopyright'))
        continuations.push(args[0] as CopyrightDeliveryReconcileData)
      return add.call(notifications, name, ...args)
    })

    await expect(channels.in_app({ after: encodeUuidCursorBefore(inApp.id) })).resolves.toEqual({
      enqueued: 1,
      hasMore: true,
    })

    expect(continuations).toEqual([{ after: encodeUuidCursorBefore(uuidAfter(inApp.id)) }])
    const queued = (await readAllQueueJobs(notifications)).filter(
      job =>
        job.opts.deduplication?.id ===
        `copyright-delivery-reconciliation:in_app:${JSON.stringify(continuations[0])}`,
    )
    expect(queued.map(job => job.name)).toEqual([
      'notifications.processReconcileCopyrightInAppDeliveryIntents',
    ])
    expect(queued.map(job => job.opts.ordering)).toEqual([
      { key: 'notifications:copyright-delivery-reconcile', concurrency: 1 },
    ])
    await expect(readJobsFor(notifications, inApp.id)).resolves.toEqual([
      { name: 'notifications.processDeliverCopyrightNotice', data: { intentId: inApp.id } },
    ])
  })

  it('reports nothing to enqueue when no intent follows the cursor', async () => {
    await expect(channels.in_app({ after: AFTER_EVERY_ROW })).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
    await expect(channels.email({ after: AFTER_EVERY_ROW })).resolves.toEqual({
      enqueued: 0,
      hasMore: false,
    })
  })

  it('fails a channel with its bulk enqueue error', async () => {
    const inApp = await createInAppIntent()
    const enqueueFailure = new Error('enqueue failed')
    vi.spyOn(notifications, 'addBulk').mockRejectedValue(enqueueFailure)

    const failure = await channels
      .in_app({ after: encodeUuidCursorBefore(inApp.id) })
      .then(() => null)
      .catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([enqueueFailure])
    await expect(readJobsFor(notifications, inApp.id)).resolves.toEqual([])
  })

  it('fails a channel on a failed page read and leaves its sibling channel running', async () => {
    const inApp = await createInAppIntent()

    await expect(channels.email({ after: 'not-a-cursor' })).rejects.toThrow(
      'Invalid copyright delivery intent cursor',
    )
    await expect(
      channels.in_app({ after: encodeUuidCursorBefore(inApp.id) }),
    ).resolves.toMatchObject({ enqueued: 1 })
  })
})

describe('processDeliverCopyrightNotice', () => {
  it('delivers a claimed in-app copyright notice exactly once', async () => {
    const intent = await createInAppIntent()

    await expect(processDeliverCopyrightNotice({ intentId: intent.id })).resolves.toBe(true)
    await expect(processDeliverCopyrightNotice({ intentId: intent.id })).resolves.toBe(false)
  })
})
