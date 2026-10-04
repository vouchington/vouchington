import { describe, expect, it } from 'vitest'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { createTestReportingTrustedEuCase } from '@voucha/test-helpers/dsa-report-figure-fixtures'
import {
  buildTestCopyrightDsaPayload,
  dsaTestPayload,
  hardDeleteRetiredTestDsaImage,
  readTestDsaImageUploadDate,
  readTestDsaRetainedImage,
} from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import { deleteImageById } from '@services/images/delete'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { recordEuCopyrightStatementOfReasons, recordUkCopyrightReview } from './index.mts'
import { assertDsaStatementPayload } from './dsa-statement-payload.mts'
import {
  DSA_COPYRIGHT_DECISION_FACTS,
  DSA_COPYRIGHT_ILLEGAL_CONTENT_EXPLANATION,
  DSA_COPYRIGHT_LEGAL_GROUNDS,
  DSA_EEA_TERRITORIAL_SCOPE,
} from './dsa-statement-templates.mts'

async function restrictionIdFor(noticeId: string): Promise<string> {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const [restriction] = aggregate?.restrictions ?? []
  if (!restriction) throw new Error('Expected one copyright restriction')
  return restriction.id
}

describe('DSA statement payload from actual restriction decisions', () => {
  it('maps a human US restriction to the closed, public Commission fields', async () => {
    const image = await createTestCopyrightImageFixture('post-image')
    const restriction = await createTestCopyrightRestrictionForImage(image)
    const payload = await buildTestCopyrightDsaPayload(restriction.restrictionId)
    expect(payload).toEqual({
      ...dsaTestPayload(),
      content_date: payload.content_date,
      application_date: payload.application_date,
      decision_facts: DSA_COPYRIGHT_DECISION_FACTS,
      illegal_content_legal_ground: DSA_COPYRIGHT_LEGAL_GROUNDS.us_dmca,
      illegal_content_explanation: DSA_COPYRIGHT_ILLEGAL_CONTENT_EXPLANATION,
      puid: restriction.restrictionId,
    })
    expect(payload.content_date).toBe(await readTestDsaImageUploadDate(image.imageId))
    expect(payload.territorial_scope).toEqual(DSA_EEA_TERRITORIAL_SCOPE)
    expect(payload.automated_detection).toBe('No')
    expect(payload.automated_decision).toBe('AUTOMATED_DECISION_NOT_AUTOMATED')
    expect(payload.decision_visibility).toEqual(['DECISION_VISIBILITY_CONTENT_DISABLED'])
    const serialized = JSON.stringify(payload)
    for (const privateValue of [
      image.actorUserId,
      image.ownerId,
      image.selector.hostedUseUrl,
      'Test claimant',
    ])
      expect(serialized).not.toContain(privateValue)
  })

  it('retains the target and uploader provenance when a retired image is physically deleted', async () => {
    const image = await createTestCopyrightImageFixture('post-image')
    const restriction = await createTestCopyrightRestrictionForImage(image)
    const before = await readTestDsaRetainedImage(image.imageId)
    expect(before).toMatchObject({
      created_by_id: image.actorUserId,
      live_image_exists: true,
      retained_target_count: 1,
    })

    await deleteImageById(image.imageId)
    const retired = await readTestDsaRetainedImage(image.imageId)
    expect(retired.unretired_placements).toBe(0)
    expect(retired.allowed_registry_records).toBe(0)
    await hardDeleteRetiredTestDsaImage(image.imageId)

    const after = await readTestDsaRetainedImage(image.imageId)
    expect(after).toEqual({
      ...retired,
      created_by_id: image.actorUserId,
      live_image_exists: false,
      retained_target_count: 1,
    })
    const payload = await buildTestCopyrightDsaPayload(restriction.restrictionId)
    expect(payload.content_date).toBe(after.uuid_date)
    expect(payload.puid).toBe(restriction.restrictionId)
  })

  it.each(['intellectual_property', 'other'] as const)(
    'uses the shared in-area trusted flagger fact for %s',
    async area => {
      const scene = await createTestReportingTrustedEuCase(area, 'restrict')
      const payload = await buildTestCopyrightDsaPayload(await restrictionIdFor(scene.noticeId))
      expect(payload.source_type).toBe(
        area === 'intellectual_property' ? 'SOURCE_TRUSTED_FLAGGER' : 'SOURCE_ARTICLE_16',
      )
      expect(payload.illegal_content_legal_ground).toBe(DSA_COPYRIGHT_LEGAL_GROUNDS.eu_dsa)
      expect(JSON.stringify(payload)).not.toContain(scene.suffix)
      expect(JSON.stringify(payload)).not.toContain(scene.claimant.id)
    },
  )

  it.each(['eu_dsa', 'uk'] as const)(
    'maps a %s restrict decision but no no_action statement',
    async jurisdiction => {
      const scene = await createTestTerritorialRestrictionScene(jurisdiction)
      const determine =
        jurisdiction === 'eu_dsa' ? recordEuCopyrightStatementOfReasons : recordUkCopyrightReview
      await determine(scene.staff, scene.noticeId, {
        text: `Private rationale ${crypto.randomUUID()}`,
        publicExplanation: `Public explanation ${crypto.randomUUID()}`,
        outcome: 'restrict',
        targets: scene.targets,
      })
      const payload = await buildTestCopyrightDsaPayload(await restrictionIdFor(scene.noticeId))
      expect(payload.illegal_content_legal_ground).toBe(DSA_COPYRIGHT_LEGAL_GROUNDS[jurisdiction])
      expect(payload.category_specification).toEqual(['KEYWORD_COPYRIGHT_INFRINGEMENT'])
      expect(payload.automated_decision).toBe('AUTOMATED_DECISION_NOT_AUTOMATED')
      const noAction = await createTestTerritorialRestrictionScene(jurisdiction)
      await determine(noAction.staff, noAction.noticeId, {
        text: 'No restriction was imposed.',
        publicExplanation: 'The report did not establish an infringement.',
        outcome: 'no_action',
        targets: [],
      })
      expect((await getCopyrightNoticePrivateAggregate(noAction.noticeId))?.restrictions).toEqual(
        [],
      )
    },
  )
})

describe('closed DSA payload validation', () => {
  it('rejects unknown fields and coercible non-string enums', () => {
    const valid = dsaTestPayload()
    expect(() => assertDsaStatementPayload(valid)).not.toThrow()
    for (const changed of [
      { ...valid, contact: 'private@example.test' },
      { ...valid, source_type: ['SOURCE_ARTICLE_16'] },
      { ...valid, automated_detection: ['No'] },
      { ...valid, automated_decision: ['AUTOMATED_DECISION_NOT_AUTOMATED'] },
      { ...valid, territorial_scope: ['GB'] },
      { ...valid, content_date: '1999-12-31' },
      { ...valid, application_date: '2019-12-31' },
    ])
      expect(() => assertDsaStatementPayload(changed)).toThrow(/DSA/)
  })
})
