import { seedCommittedTerritorialDecision } from '@voucha/test-helpers/copyright-territorial-committed-decision'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from '@voucha/test-helpers/copyright-territorial-committed-redress'
import { assertTerritorialReviewOutcome } from '@voucha/test-helpers/copyright-territorial-review-outcome'
import { seedRestorationSceneWithhold } from '@voucha/test-helpers/copyright-withhold-scene-fixture'
import { assertSurfaceRestoreOutcome } from '@voucha/test-helpers/copyright-surface-restore-outcome'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestCopyrightStatementFacts } from '@voucha/test-helpers/copyright-statement-notices'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { readTestRepeatInfringerIncidents } from '@voucha/test-helpers/copyright-repeat-infringer'
import { buildCopyrightStatementOfReasons } from './statement-of-reasons.mts'
const jurisdictions = ['eu_dsa', 'uk'] as const

describe('territorial complaint effects on a confirmed restriction', () => {
  useStaydownMatching()
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe.each(jurisdictions)('%s atomic complaint decision', jurisdiction => {
    it.each(['maintain', 'revoke'] as const)(
      '%s commits all decision consequences or none',
      async disposition => {
        expect.hasAssertions()
        const scene = await createTestTerritorialRestrictionScene(jurisdiction)
        await seedCommittedTerritorialDecision(jurisdiction, scene.staff, scene.noticeId, {
          text: 'The hosted image reproduces the protected photograph.',
          publicExplanation: 'The image reproduces the photograph.',
          outcome: 'restrict',
          targets: scene.targets,
        })
        const aggregate = await getCopyrightNoticePrivateAggregate(scene.noticeId)
        const withhold = aggregate?.actionIntents.find(row => row.action === 'withhold')
        if (!withhold) throw new Error('Committed territorial withhold missing')
        installTestMediaDeliveryEdge()
        await seedRestorationSceneWithhold(withhold.id)
        const complaint = await seedCommittedTerritorialRedress(
          jurisdiction,
          scene.noticeId,
          scene.claimant,
          'Review the restriction.',
        )
        await assertTerritorialReviewOutcome({
          jurisdiction,
          noticeId: scene.noticeId,
          redressId: complaint.id,
          staff: scene.staff,
          claimantId: scene.claimant.id,
          posterId: scene.posts[0]!.poster.id,
          disposition,
          rationale: 'The evidence establishes this complaint outcome.',
        })
      },
    )
  })

  it.each(jurisdictions)('%s statement facts exclude private staff reasons', async jurisdiction => {
    const scene = await createTestTerritorialRestrictionScene(jurisdiction)
    const privateReason = `Private staff reason ${crypto.randomUUID()}`
    const publicExplanation = `Public explanation ${crypto.randomUUID()}`
    await seedCommittedTerritorialDecision(jurisdiction, scene.staff, scene.noticeId, {
      text: privateReason,
      publicExplanation,
      outcome: 'restrict',
      targets: scene.targets,
    })
    const restriction = (await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions[0]
    if (!restriction) throw new Error('Territorial restriction missing')
    const facts = await readTestCopyrightStatementFacts(scene.noticeId, restriction.id)
    expect(facts.explanation).toBe(publicExplanation)
    const statement = buildCopyrightStatementOfReasons({
      ...facts,
      audience: 'poster',
      event: 'restricted',
    })
    expect(statement.text).toContain(publicExplanation)
    expect(JSON.stringify(statement.fields)).not.toContain(publicExplanation)
    expect(JSON.stringify(statement)).not.toContain(privateReason)
    expect(JSON.stringify(statement)).not.toContain(scene.claimantContact)
  })

  it.each(jurisdictions)(
    '%s revoke restores delivery and voids incident and staydown entry',
    async jurisdiction => {
      installTestMediaDeliveryEdge()
      const scene = await createTestTerritorialRestrictionScene(jurisdiction)
      await seedCommittedTerritorialDecision(jurisdiction, scene.staff, scene.noticeId, {
        text: 'The hosted image reproduces the claimed photograph.',
        publicExplanation: 'This post image reproduces the protected photograph.',
        outcome: 'restrict',
        targets: scene.targets,
      })
      const before = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      const withhold = before?.actionIntents.find(intent => intent.action === 'withhold')
      if (!withhold) throw new Error('Withhold intent missing')
      await seedRestorationSceneWithhold(withhold.id)
      const posterId = scene.posts[0]!.poster.id
      expect(await readTestRepeatInfringerIncidents(posterId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ copyright_notice_id: scene.noticeId, is_operative: true }),
        ]),
      )
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toHaveLength(1)

      const complaint = await seedCommittedTerritorialRedress(
        jurisdiction,
        scene.noticeId,
        scene.claimant,
        'I ask for the restriction to be reversed.',
      )
      await seedCommittedTerritorialRedressDecision(
        jurisdiction,
        scene.noticeId,
        complaint.id,
        scene.staff,
        {
          disposition: 'revoke',
          rationale: 'The complaint demonstrates the restriction was unfounded.',
        },
      )
      const reversed = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      const restore = reversed?.actionIntents.find(intent => intent.action === 'restore')
      if (!restore) throw new Error('Complaint restore intent missing')
      expect(await readTestRepeatInfringerIncidents(posterId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ copyright_notice_id: scene.noticeId, is_operative: false }),
        ]),
      )
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toEqual([])
      const target = before!.targets[0]!
      await assertSurfaceRestoreOutcome({
        noticeId: scene.noticeId,
        restrictionId: restore.copyright_restriction_id,
        placementId: target.placement_id,
        restoreId: restore.id,
        outcome: 'visible',
        incidentAccountIds: [posterId],
        deliveries: [
          `poster_restoration_notice:email:${posterId}`,
          `poster_restoration_notice:in_app:${posterId}`,
        ],
      })
    },
  )

  it.each(jurisdictions)(
    '%s maintain leaves restriction, incident, and staydown in place',
    async jurisdiction => {
      const scene = await createTestTerritorialRestrictionScene(jurisdiction)
      await seedCommittedTerritorialDecision(jurisdiction, scene.staff, scene.noticeId, {
        text: 'The hosted image reproduces the claimed photograph.',
        publicExplanation: 'This post image reproduces the protected photograph.',
        outcome: 'restrict',
        targets: scene.targets,
      })
      const before = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toHaveLength(1)
      const complaint = await seedCommittedTerritorialRedress(
        jurisdiction,
        scene.noticeId,
        scene.claimant,
        'Please review the restriction.',
      )
      await seedCommittedTerritorialRedressDecision(
        jurisdiction,
        scene.noticeId,
        complaint.id,
        scene.staff,
        {
          disposition: 'maintain',
          rationale: 'The restriction remains justified.',
        },
      )
      const after = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      expect(after?.actionIntents).toEqual(before?.actionIntents)
      expect(after?.restrictions[0]?.lifted_at).toBeNull()
      expect(await readTestRepeatInfringerIncidents(scene.posts[0]!.poster.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ copyright_notice_id: scene.noticeId, is_operative: true }),
        ]),
      )
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toHaveLength(1)
    },
  )
})
