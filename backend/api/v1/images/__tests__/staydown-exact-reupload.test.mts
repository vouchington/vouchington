import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as imageEnqueues from '@queues/images/enqueues'
import * as staydownMatches from '@services/copyright-notices/staydown-matches'
import * as completeUploadModule from '@services/images/complete-upload'
import { getImageByIdFromPrimary } from '@services/images/get'
import { createTestUser, insertPendingTestImage } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readCopyrightStaydownMatches } from '@voucha/test-helpers/data-stores/psql/copyright-staydown'
import { createRestrictedStaydownCase } from '@voucha/test-helpers/services/copyright-notices/staydown-fixture'
import {
  enableStaydownMatchingForTest,
  useStaydownMatching,
} from '@voucha/test-helpers/services/copyright-notices/staydown-matching'

/**
 * A moderator-confirmed image, and a member whose completion of a new upload deduplicates to it:
 * `completeImageUpload` answers with the existing image row, as it does for bytes already hosted.
 */
async function createDuplicateUpload() {
  const restore = await enableStaydownMatchingForTest()
  const staydownCase = await createRestrictedStaydownCase()
  restore()
  const existing = await getImageByIdFromPrimary(staydownCase.imageIds[0]!)
  const uploader = await createTestUser()
  const pendingId = await insertPendingTestImage(uploader.id)
  vi.spyOn(completeUploadModule, 'completeImageUpload').mockResolvedValue(existing!)
  const request = createRequest()
  await request.authenticateAs(uploader)
  return { ...staydownCase, existing: existing!, uploader, pendingId, request }
}

describe('staydown exact re-upload', () => {
  beforeEach(() => {
    vi.spyOn(imageEnqueues, 'enqueueStaydownHash').mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('re-uploading bytes a moderator confirmed as infringing, switch off', () => {
    it('publishes the upload and records nothing for staff', async () => {
      const duplicate = await createDuplicateUpload()

      const response = await duplicate.request
        .post(`/api/v1/images/${duplicate.pendingId}/completions`)
        .expect(200)

      expect(response.body.image).toEqual({ id: duplicate.existing.id, upload_status: 'complete' })
      expect(await readCopyrightStaydownMatches(duplicate.noticeId)).toEqual([])
    })
  })

  describe('re-uploading bytes a moderator confirmed as infringing, switch on', () => {
    useStaydownMatching()

    it('publishes the upload and sends it to staff review', async () => {
      const duplicate = await createDuplicateUpload()

      const response = await duplicate.request
        .post(`/api/v1/images/${duplicate.pendingId}/completions`)
        .expect(200)

      expect(response.body.image).toEqual({ id: duplicate.existing.id, upload_status: 'complete' })
      expect(await readCopyrightStaydownMatches(duplicate.noticeId)).toEqual([
        expect.objectContaining({
          image_id: duplicate.existing.id,
          uploaded_by_id: duplicate.uploader.id,
          match_kind: 'exact',
          hamming_distance: 0,
          reviewed_at: null,
        }),
      ])
    })

    it('still publishes the upload when recording the match fails', async () => {
      const duplicate = await createDuplicateUpload()
      vi.spyOn(staydownMatches, 'recordCopyrightStaydownExactMatch').mockRejectedValue(
        new Error('database unavailable'),
      )

      const response = await duplicate.request
        .post(`/api/v1/images/${duplicate.pendingId}/completions`)
        .expect(200)

      expect(response.body.image).toEqual({ id: duplicate.existing.id, upload_status: 'complete' })
      expect(await readCopyrightStaydownMatches(duplicate.noticeId)).toEqual([])
    })

    it('records nothing for an upload that is not a duplicate of hosted bytes', async () => {
      const duplicate = await createDuplicateUpload()
      const record = vi.spyOn(staydownMatches, 'recordCopyrightStaydownExactMatch')
      const ownImage = { ...duplicate.existing, id: duplicate.pendingId }
      vi.spyOn(completeUploadModule, 'completeImageUpload').mockResolvedValue(ownImage)

      await duplicate.request.post(`/api/v1/images/${duplicate.pendingId}/completions`).expect(200)

      expect(record).not.toHaveBeenCalled()
      expect(await readCopyrightStaydownMatches(duplicate.noticeId)).toEqual([])
    })
  })
})
