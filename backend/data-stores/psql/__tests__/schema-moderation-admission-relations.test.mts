import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  countTestRelationRows,
  createRelationTestCommunity,
  createRelationTestModeratorAction,
  deleteTestModeratorAction,
  deleteTestReportIntegrityFlag,
  deleteTestRetainedPostIdentity,
  deleteTestUser,
  insertTestAdmissionConsumption,
  insertTestFlagReporter,
  insertTestFlagWithStoredReporterIds,
  linkTestModeratorActionRestriction,
  rejectionCode,
} from '../../../test-helpers/data-stores/psql/moderation-admission-relations.mts'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import {
  deleteTestAdmissionReservation,
  ensureTestAdmittedPostIdentityDirect,
  insertContributionAdmissionReservationForTest,
  insertTestCommittedAdmissionReservation,
} from '../../../test-helpers/entities/contribution-admission-fixtures.mts'
import {
  deleteTestCommunityRestriction,
  insertTestCommunityRestriction,
} from '../../../test-helpers/entities/community-restrictions.mts'
import { insertTestReportIntegrityFlag } from '../../../test-helpers/entities/report-integrity.mts'
import { onGracefulShutdown } from '../index.mts'

const FOREIGN_KEY_VIOLATION = '23503'
const CHECK_VIOLATION = '23514'
const RESTRICT_VIOLATION = '23001'

describe('moderation and admission joined ids', () => {
  afterAll(onGracefulShutdown)

  describe('report_integrity_flag_reporters', () => {
    it('rejects a reporter row for a missing flag or a missing user', async () => {
      const reported = await createLocalTestUser()
      const flagId = await insertTestReportIntegrityFlag({ reportedUserId: reported.id })

      await expect(
        rejectionCode(() => insertTestFlagReporter(randomUUID(), reported.id)),
      ).resolves.toBe(FOREIGN_KEY_VIOLATION)
      await expect(rejectionCode(() => insertTestFlagReporter(flagId, randomUUID()))).resolves.toBe(
        FOREIGN_KEY_VIOLATION,
      )
    })

    it('deletes reporter rows with their flag and with a deleted reporter', async () => {
      const reported = await createLocalTestUser()
      const keptReporter = await createLocalTestUser()
      const deletedReporter = await createLocalTestUser()
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: reported.id,
        reporterUserIds: [keptReporter.id, deletedReporter.id],
      })
      expect(await countTestRelationRows('flagReporters', flagId)).toBe(2)

      await deleteTestUser(deletedReporter.id)
      expect(await countTestRelationRows('flagReporters', flagId)).toBe(1)

      await deleteTestReportIntegrityFlag(flagId)
      expect(await countTestRelationRows('flagReporters', flagId)).toBe(0)
    })

    it('rejects reporter ids stored in flag details', async () => {
      const reported = await createLocalTestUser()

      await expect(
        rejectionCode(() => insertTestFlagWithStoredReporterIds(reported.id)),
      ).resolves.toBe(CHECK_VIOLATION)
    })
  })

  describe('moderator_action_community_restrictions', () => {
    it('rejects a link to a missing moderator action or a missing restriction', async () => {
      const actor = await createLocalTestUser()
      const communityId = await createRelationTestCommunity(actor.id)
      const actionId = await createRelationTestModeratorAction(actor.id, communityId)
      const restriction = await insertTestCommunityRestriction({
        communityId,
        restrictionType: 'no_links',
        activatedById: actor.id,
      })

      await expect(
        rejectionCode(() => linkTestModeratorActionRestriction(randomUUID(), restriction.id)),
      ).resolves.toBe(FOREIGN_KEY_VIOLATION)
      await expect(
        rejectionCode(() => linkTestModeratorActionRestriction(actionId, randomUUID())),
      ).resolves.toBe(FOREIGN_KEY_VIOLATION)
    })

    it('deletes links with their moderator action or their restriction', async () => {
      const actor = await createLocalTestUser()
      const communityId = await createRelationTestCommunity(actor.id)
      const restriction = await insertTestCommunityRestriction({
        communityId,
        restrictionType: 'no_links',
        activatedById: actor.id,
      })
      const deletedAction = await createRelationTestModeratorAction(actor.id, communityId)
      const survivingAction = await createRelationTestModeratorAction(actor.id, communityId)
      await linkTestModeratorActionRestriction(deletedAction, restriction.id)
      await linkTestModeratorActionRestriction(survivingAction, restriction.id)

      await deleteTestModeratorAction(deletedAction)
      expect(await countTestRelationRows('actionRestrictions', deletedAction)).toBe(0)
      expect(await countTestRelationRows('actionRestrictions', survivingAction)).toBe(1)

      await deleteTestCommunityRestriction(restriction.id)
      expect(await countTestRelationRows('actionRestrictions', survivingAction)).toBe(0)
    })
  })

  describe('post_admission_reservations.committed_post_id', () => {
    it('rejects a committed replay for a post without a retained identity', async () => {
      const actor = await createLocalTestUser()

      await expect(
        rejectionCode(() =>
          insertTestCommittedAdmissionReservation({ actorId: actor.id, postId: randomUUID() }),
        ),
      ).resolves.toBe(FOREIGN_KEY_VIOLATION)
    })

    it('restricts deleting the retained post identity while a replay references it', async () => {
      const actor = await createLocalTestUser()
      const postId = randomUUID()
      await ensureTestAdmittedPostIdentityDirect(postId)
      const reservationId = await insertTestCommittedAdmissionReservation({
        actorId: actor.id,
        postId,
      })

      await expect(rejectionCode(() => deleteTestRetainedPostIdentity(postId))).resolves.toBe(
        RESTRICT_VIOLATION,
      )

      await deleteTestAdmissionReservation(reservationId)
      await expect(
        rejectionCode(() => deleteTestRetainedPostIdentity(postId)),
      ).resolves.toBeUndefined()
    })
  })

  describe('post_admission_quota_consumptions.reservation_id', () => {
    it('rejects a consumption for a missing reservation', async () => {
      const actor = await createLocalTestUser()

      await expect(
        rejectionCode(() => insertTestAdmissionConsumption(randomUUID(), actor.id)),
      ).resolves.toBe(FOREIGN_KEY_VIOLATION)
    })

    it('deletes the consumption with its reservation', async () => {
      const actor = await createLocalTestUser()
      const reservationId = await insertContributionAdmissionReservationForTest({
        actorId: actor.id,
      })
      await insertTestAdmissionConsumption(reservationId, actor.id)
      expect(await countTestRelationRows('consumptions', reservationId)).toBe(1)

      await deleteTestAdmissionReservation(reservationId)

      expect(await countTestRelationRows('consumptions', reservationId)).toBe(0)
    })
  })
})
