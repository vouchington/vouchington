import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countDynamicConfigAuditRows, createTestUser } from '@voucha/test-helpers'
import { persistDynamicConfigTestBaseline } from '@voucha/test-helpers/dynamic-config'
import {
  copyrightConfig,
  getAutomaticWithholdingThresholds,
  getCopyrightEvidenceRetentionDays,
  getCopyrightReviewTargetMinutes,
  getCopyrightDsaSorDatabaseFrom,
  isCopyrightEvidenceRetentionDeletionEnabled,
} from '@services/copyright-notices/config'

const path = '/api/v1/dynamic-config/namespaces/copyright'

describe('copyright dynamic-config namespace', () => {
  it('launches with the review target unset, so only missed deadlines page', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    const request = createRequest()
    await request.authenticateAs(developer)

    const current = await request.get(path).expect(200)

    expect(current.body.namespace.fields).toContainEqual(
      expect.objectContaining({
        name: 'reviewTargetMinutes',
        type: 'number',
        value: 0,
        default_value: 0,
        min_value: 0,
        max_value: 10_080,
        integer: true,
      }),
    )
    expect(await getCopyrightReviewTargetMinutes()).toBeNull()
    await request
      .patch(path)
      .send({ config: { reviewTargetMinutes: -1 } })
      .expect(400)
  })

  it('launches with evidence retention deletion off and no retention period', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    const request = createRequest()
    await request.authenticateAs(developer)

    const current = await request.get(path).expect(200)

    expect(current.body.namespace.fields).toContainEqual(
      expect.objectContaining({
        name: 'evidenceRetentionDays',
        type: 'number',
        value: 0,
        default_value: 0,
        min_value: 0,
        integer: true,
      }),
    )
    expect(current.body.namespace.fields).toContainEqual(
      expect.objectContaining({
        name: 'evidenceRetentionDeletion',
        type: 'boolean',
        value: false,
        default_value: false,
      }),
    )
    expect(await isCopyrightEvidenceRetentionDeletionEnabled()).toBe(false)
    expect(await getCopyrightEvidenceRetentionDays()).toBeNull()
    await request
      .patch(path)
      .send({ config: { evidenceRetentionDays: -1 } })
      .expect(400)
  })

  it('launches with automatic provisional withholding off and every abuse gate unset', async () => {
    const [developer, moderator] = await Promise.all([
      createTestUser({ extraRoles: ['developer'] }),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const request = createRequest()
    await request.authenticateAs(developer)
    const current = await request.get(path).expect(200)
    expect(current.body.namespace.config).toEqual({
      automaticProvisionalWithholding: false,
      reviewTargetMinutes: 0,
      evidenceRetentionDeletion: false,
      evidenceRetentionDays: 0,
      staydownMatching: false,
      trustedFlaggerPriority: false,
      dsaTransparencyReports: false,
      dsaSorDatabase: false,
      dsaSorDatabaseFrom: '',
      automaticWithholdingMinTrustTier: -1,
      automaticWithholdingMinAccountAgeDays: -1,
      automaticWithholdingClaimantDailyCap: -1,
      automaticWithholdingPosterDailyCap: -1,
    })
    expect(await getAutomaticWithholdingThresholds()).toBeNull()
    const moderatorRequest = createRequest()
    await moderatorRequest.authenticateAs(moderator)
    await moderatorRequest
      .patch(path)
      .send({ config: { automaticProvisionalWithholding: true } })
      .expect(403)
    await moderatorRequest
      .patch(path)
      .send({ config: { automaticWithholdingPosterDailyCap: 3 } })
      .expect(403)
  })

  it('audits a developer setting an abuse gate and rejects an out-of-range value', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    const request = createRequest()
    await request.authenticateAs(developer)
    const auditRows = await countDynamicConfigAuditRows('copyright')
    await request
      .patch(path)
      .send({ config: { automaticWithholdingClaimantDailyCap: -2 } })
      .expect(400)
    expect(await countDynamicConfigAuditRows('copyright')).toBe(auditRows)

    try {
      const updated = await request
        .patch(path)
        .send({ config: { automaticWithholdingPosterDailyCap: 3 } })
        .expect(200)

      expect(updated.body).toMatchObject({
        changed: true,
        namespace: { config: { automaticWithholdingPosterDailyCap: 3 } },
      })
      const history = await request.get(`${path}/history`).expect(200)
      expect(
        history.body.history.find(
          (entry: { changed_by: { id: string } | null }) => entry.changed_by?.id === developer.id,
        ),
      ).toMatchObject({
        namespace: 'copyright',
        changed_fields: { automaticWithholdingPosterDailyCap: { previous: -1, next: 3 } },
      })
      // One gate set is not enough: the rest are still unset, so automation still fails closed.
      expect(await getAutomaticWithholdingThresholds()).toBeNull()
    } finally {
      // The route persisted the gate to the shared test Valkey; put the launch default back.
      await persistDynamicConfigTestBaseline(copyrightConfig)
    }
  })

  it('accepts only a real UTC calendar date for DSA statement submissions', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    const request = createRequest()
    await request.authenticateAs(developer)
    expect(await getCopyrightDsaSorDatabaseFrom()).toBeNull()
    for (const value of ['2026-13-40', '2026-02-30', '0000-01-01', 20261003]) {
      await request
        .patch(path)
        .send({ config: { dsaSorDatabaseFrom: value } })
        .expect(400)
    }
    try {
      await request
        .patch(path)
        .send({ config: { dsaSorDatabaseFrom: '2026-10-03' } })
        .expect(200)
      expect((await getCopyrightDsaSorDatabaseFrom())?.toISOString()).toBe(
        '2026-10-03T00:00:00.000Z',
      )
      await request
        .patch(path)
        .send({ config: { dsaSorDatabaseFrom: '' } })
        .expect(200)
      expect(await getCopyrightDsaSorDatabaseFrom()).toBeNull()
    } finally {
      await persistDynamicConfigTestBaseline(copyrightConfig)
    }
  })
})
