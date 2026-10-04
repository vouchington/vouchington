import { describe, expect, it } from 'vitest'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  makeDependencies,
  makeResult,
  post,
  work,
} from '@voucha/test-helpers/workers/post-publication/processors/fixtures'
import { processReconcilePostPublication } from '../processors.mts'

describe('publication processor captured limits', () => {
  it('keeps the selected page and independent snapshot cap on the locked canonical reread', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      reconciliation_page_size: 1,
      identity_snapshot_page_size: 2,
    })
    const dependencies = makeDependencies()
    dependencies.reconcilePostPublicationDirtyWork.mockImplementationOnce(async () => {
      overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
        reconciliation_page_size: 500,
        identity_snapshot_page_size: 1000,
      })
      return makeResult()
    })
    try {
      await processReconcilePostPublication({}, dependencies)
      expect(dependencies.reconcilePostPublicationDirtyWork.mock.calls).toEqual([
        [work, 1, undefined, 2],
        [work, 1, [post.id], 2],
      ])
    } finally {
      restore()
    }
  })
})
