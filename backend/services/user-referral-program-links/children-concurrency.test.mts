import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  createReferralProgramFixture,
  createTestUserDirect,
  getTestPostgresBackendProcessId,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { getNextReferralChildCleanupParentForTest } from '@voucha/test-helpers/entities/referral-links'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { createUserReferralLink } from './create.mts'
import { createChildReferralLinks } from './create-child.mts'
import { getUserReferralLink } from './get.mts'
import { softDeleteChildrenForUser, softDeleteChildrenOfParent } from './children.mts'
import { referralLinkCleanupConfig } from './work-limits.mts'

describe('child referral cleanup concurrency', () => {
  it('continues after a parent deletion wins the selected child row lock', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(referralLinkCleanupConfig, { batch_size: 1 }))
    const user = await createTestUserDirect()
    const fixture = await createReferralProgramFixture({ createdById: user.id })
    const childIds: string[] = []
    for (let index = 0; index < 2; index++) {
      const parent = await createUserReferralLink(user, WEB_PROVENANCE, {
        user_id: user.id,
        referral_program_id: fixture.referralProgramId,
        url: `https://${fixture.hostname}/ref/parent-${randomUUID()}`,
      })
      const [child] = await createChildReferralLinks(user.id, WEB_PROVENANCE, [
        {
          userId: user.id,
          referralProgramId: fixture.referralProgramId,
          parentLinkId: parent.id,
          url: `https://${fixture.hostname}/ref/child-${randomUUID()}`,
        },
      ])
      if (!child) throw new Error('Expected an owned child referral link')
      childIds.push(child.id)
    }
    const parentId = await getNextReferralChildCleanupParentForTest(user.id)
    await using holder = await beginTransaction()
    await softDeleteChildrenOfParent(parentId, { query: holder })
    const holderProcessId = await getTestPostgresBackendProcessId(holder)
    await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'softDeleteChildrenForUser',
        releaseHolder: () => holder[Symbol.asyncDispose](),
      },
      async waitForLock => {
        const cleanup = (async () => {
          await using query = await beginTransaction()
          await softDeleteChildrenForUser(user.id, { query })
          await query.commit()
        })()
        void cleanup.catch(() => {})
        await waitForLock(cleanup)
        await holder.commit()
        await cleanup
      },
    )
    for (const childId of childIds) expect(await getUserReferralLink(childId)).toBeNull()
  })
})
