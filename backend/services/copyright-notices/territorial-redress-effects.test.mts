import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { readCopyrightStaydownEntries } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestCopyrightStatementFacts } from '@voucha/test-helpers/copyright-statement-notices'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { getCopyrightRepeatInfringerAccount } from './repeat-infringer-incidents.mts'
import { buildCopyrightStatementOfReasons } from './statement-of-reasons.mts'
import {
  processCopyrightActionIntent,
  recordEuCopyrightRedressDecision,
  recordEuCopyrightStatementOfReasons,
  recordUkCopyrightRedressDecision,
  recordUkCopyrightReview,
  submitEuCopyrightRedress,
  submitUkCopyrightRedress,
} from './index.mts'

const jurisdictions = ['eu_dsa', 'uk'] as const
const determine = {
  eu_dsa: recordEuCopyrightStatementOfReasons,
  uk: recordUkCopyrightReview,
}
const submit = {
  eu_dsa: submitEuCopyrightRedress,
  uk: submitUkCopyrightRedress,
}
const decideComplaint = {
  eu_dsa: recordEuCopyrightRedressDecision,
  uk: recordUkCopyrightRedressDecision,
}

describe('territorial complaint effects on a confirmed restriction', () => {
  useStaydownMatching()
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(jurisdictions)('%s statement facts exclude private staff reasons', async jurisdiction => {
    const scene = await createTestTerritorialRestrictionScene(jurisdiction)
    const privateReason = `Private staff reason ${crypto.randomUUID()}`
    const publicExplanation = `Public explanation ${crypto.randomUUID()}`
    await determine[jurisdiction](scene.staff, scene.noticeId, {
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
      await determine[jurisdiction](scene.staff, scene.noticeId, {
        text: 'The hosted image reproduces the claimed photograph.',
        publicExplanation: 'This post image reproduces the protected photograph.',
        outcome: 'restrict',
        targets: scene.targets,
      })
      const before = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      const withhold = before?.actionIntents.find(intent => intent.action === 'withhold')
      if (!withhold) throw new Error('Withhold intent missing')
      await expect(processCopyrightActionIntent(withhold.id)).resolves.toBe('applied')
      const posterId = scene.posts[0]!.poster.id
      expect((await getCopyrightRepeatInfringerAccount(posterId)).incidents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ copyright_notice_id: scene.noticeId, is_operative: true }),
        ]),
      )
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toHaveLength(1)

      const complaint = await submit[jurisdiction](
        scene.claimant,
        scene.noticeId,
        crypto.randomUUID(),
        'I ask for the restriction to be reversed.',
      )
      await decideComplaint[jurisdiction](scene.staff, scene.noticeId, complaint.id, {
        disposition: 'revoke',
        rationale: 'The complaint demonstrates the restriction was unfounded.',
      })
      const reversed = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      const restore = reversed?.actionIntents.find(intent => intent.action === 'restore')
      if (!restore) throw new Error('Complaint restore intent missing')
      expect((await getCopyrightRepeatInfringerAccount(posterId)).incidents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ copyright_notice_id: scene.noticeId, is_operative: false }),
        ]),
      )
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toEqual([])
      await expect(processCopyrightActionIntent(restore.id)).resolves.toBe('applied')
      expect(
        (await getCopyrightNoticePrivateAggregate(scene.noticeId))?.restrictions[0]?.lifted_at,
      ).toBeInstanceOf(Date)
    },
  )

  it.each(jurisdictions)(
    '%s maintain leaves restriction, incident, and staydown in place',
    async jurisdiction => {
      const scene = await createTestTerritorialRestrictionScene(jurisdiction)
      await determine[jurisdiction](scene.staff, scene.noticeId, {
        text: 'The hosted image reproduces the claimed photograph.',
        publicExplanation: 'This post image reproduces the protected photograph.',
        outcome: 'restrict',
        targets: scene.targets,
      })
      const before = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toHaveLength(1)
      const complaint = await submit[jurisdiction](
        scene.claimant,
        scene.noticeId,
        crypto.randomUUID(),
        'Please review the restriction.',
      )
      await decideComplaint[jurisdiction](scene.staff, scene.noticeId, complaint.id, {
        disposition: 'maintain',
        rationale: 'The restriction remains justified.',
      })
      const after = await getCopyrightNoticePrivateAggregate(scene.noticeId)
      expect(after?.actionIntents).toEqual(before?.actionIntents)
      expect(after?.restrictions[0]?.lifted_at).toBeNull()
      expect(
        (await getCopyrightRepeatInfringerAccount(scene.posts[0]!.poster.id)).incidents,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ copyright_notice_id: scene.noticeId, is_operative: true }),
        ]),
      )
      expect(await readCopyrightStaydownEntries(scene.noticeId)).toHaveLength(1)
    },
  )
})
