import { expect, onTestFinished } from 'vitest'
import type { Response } from 'supertest'
import {
  decodeUuidCursor,
  encodeScopedPreciseTimestampCursor,
  isSimpleCursor,
} from '@modules/pagination'
import type { PrivateUser } from '../services/users/types.mts'
import { copyrightStaffEmailIntakeQueueCursorScope } from '../services/copyright-notices/read-models-staff-email-intakes.mts'
import type { createRequest } from './api/server.mts'
import { encodeUuidCursorBefore } from './modules/pagination/uuid-cursors.mts'
import { ownedKeysetReadPolicy } from '../../test-helpers/vitest-owned-keyset-read-policy.mts'
import {
  recordSharedDbScopeViolation,
  sharedDbScopeTestIdentity,
} from '../../test-helpers/vitest-shared-db-scope-violations.mts'

/** Read the original staff route from the immediate predecessor of a real eligible fixture. */
export async function readOwnedCopyrightEmailQueue(
  request: ReturnType<typeof createRequest>,
  moderator: PrivateUser,
  fixture: { id: string; receivedAt: Date },
  includeUnknownQueryKey = false,
): Promise<{ headers: Record<string, string>; body: unknown }> {
  const timestamp = fixture.receivedAt.toISOString().replace(/Z$/, '000Z')
  const { id: afterId } = decodeUuidCursor(
    encodeUuidCursorBefore(fixture.id),
    isSimpleCursor,
    'Invalid owned intake UUID predecessor',
  )
  const after = encodeScopedPreciseTimestampCursor(
    timestamp,
    afterId,
    copyrightStaffEmailIntakeQueueCursorScope,
  )
  const close = ownedKeysetReadPolicy.register(
    sharedDbScopeTestIdentity(),
    { actorId: moderator.id, id: fixture.id, timestamp, afterId },
    recordSharedDbScopeViolation,
  )
  let observed: Promise<{ response: Response } | { err: unknown }> | undefined
  // A timeout ends observation, not the real HTTP request. Drain it before unregistering.
  const cleanup = async () => {
    await observed
    close()
  }
  onTestFinished(cleanup)
  try {
    const query = new URLSearchParams({ limit: '1', after })
    if (includeUnknownQueryKey) query.set('injected', '1')
    observed = request
      .get(`/api/v1/copyright-email-intakes/review-queue?${query}`)
      .expect(200)
      .then(
        response => ({ response }),
        (err: unknown) => ({ err }),
      )
    const outcome = await observed
    if ('err' in outcome) throw outcome.err
    const { response } = outcome
    expect(
      response.body.copyright_email_intakes.map((intake: { id: string }) => intake.id),
    ).toEqual([fixture.id])
    return { headers: response.headers, body: response.body as unknown }
  } finally {
    await cleanup()
  }
}
