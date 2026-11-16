import { beforeEach, describe, expect, it } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createCopyrightRecoveryPurgeScene } from '@voucha/test-helpers/copyright-recovery-purge-scene'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  readCopyrightCasePurgeFixture,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { recoverBlockedCopyrightHoldRestoration } from './hold-restoration-recovery.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const purgeNow = new Date('2100-01-01T12:00:00.000Z')

describe('blocked restoration recovery versus case purge', () => {
  useAutomaticProvisionalWithholding()
  useCopyrightEvidenceBucket()
  const setPageSize = useCopyrightCasePurgePageSize()
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  it('cannot reopen an original restore after purge wins its authority snapshot', async () => {
    await setPageSize(100)
    const scene = await createCopyrightRecoveryPurgeScene()
    let data: CopyrightCasePurgeJobData = {
      noticeId: scene.notice.id,
      phase: 'parties',
      phaseIndex: 0,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    }
    let purgeCompleted = false
    const restore = afterPostgresTransactionQueryForTest(
      '/* recoverBlockedCopyrightHoldRestoration:notice */',
      values => values.includes(scene.restore.id),
      async () => {
        for (let step = 0; step < 1000; step += 1) {
          const page = await runCopyrightCasePurgePage(data, purgeNow)
          data = page.data
          if (!page.hasMore) {
            purgeCompleted = true
            break
          }
        }
      },
    )
    let reopened: number | undefined
    let conflict: unknown
    try {
      reopened = await recoverBlockedCopyrightHoldRestoration(scene.restore.id, scene.restorationAt)
    } catch (err) {
      conflict = err
    } finally {
      restore()
    }
    expect(purgeCompleted).toBe(true)
    expect(await readCopyrightCasePurgeFixture(scene.notice.id)).toMatchObject({
      live: false,
      artifactCount: 0,
      submissionCount: 0,
    })
    expect([
      0,
      expect.objectContaining({ status: 409, cause: expect.objectContaining({ code: '40001' }) }),
    ]).toContainEqual(conflict ?? reopened)
  })
})
