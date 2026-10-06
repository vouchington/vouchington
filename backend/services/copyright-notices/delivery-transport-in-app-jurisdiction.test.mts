import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { listNotifications } from '@services/notifications'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  approveJurisdictionPolicy,
  seedPendingTerritorialNotice,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { deliverCopyrightInAppNotification } from './delivery-transport.mts'

async function deliverDecisionNotice(jurisdiction: 'eu_dsa' | 'uk'): Promise<string> {
  const [claimant, administrator] = await Promise.all([
    createTestUser(),
    createTestUser({ administrator: true }),
  ])
  await approveJurisdictionPolicy(administrator, jurisdiction)
  const noticeId = await seedPendingTerritorialNotice(jurisdiction, claimant)
  // With no stored statement, the in-app body is the fallback copy chosen by the notice's jurisdiction.
  const intent = await createCopyrightDeliveryIntent({
    noticeId,
    submissionId: null,
    correspondenceId: null,
    recipientUserId: claimant.id,
    recipientRole: 'claimant',
    deliveryKind: 'claimant_decision_notice',
    channel: 'in_app',
    idempotencyKey: `copyright-in-app-jurisdiction:${crypto.randomUUID()}`,
  })
  await expect(deliverCopyrightInAppNotification(intent.id)).resolves.toBe(true)
  const { notifications } = await listNotifications(claimant.id)
  const notification = Object.values(notifications).find(
    item => item.copyright_notice_id === noticeId,
  )
  if (!notification) throw new Error('Expected the in-app decision notice')
  return notification.body
}

describe('copyright in-app decision notice by jurisdiction', () => {
  useCopyrightIntakeEnvironment()

  it('uses the EU variant for an EU notice, not the US fallback', async () => {
    const body = await deliverDecisionNotice('eu_dsa')

    expect(body).toContain('submit an internal complaint')
    expect(body).toContain('certified out-of-court dispute settlement body')
    expect(body).toContain('judicial redress through a court')
    expect(body).not.toContain('/copyright/')
  })

  it('uses the court-only UK variant for a UK notice', async () => {
    const body = await deliverDecisionNotice('uk')

    expect(body).toContain('judicial redress through a court')
    expect(body).not.toContain('internal complaint')
    expect(body).not.toContain('/copyright/')
  })
})
