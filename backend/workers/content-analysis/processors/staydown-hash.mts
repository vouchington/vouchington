import { type MediaBody, withTemporaryMediaFile } from '@vouchington/media'
import { isCopyrightStaydownMatchingEnabled } from '@services/copyright-notices/config'
import {
  fillCopyrightStaydownEntryHash,
  recordCopyrightStaydownPerceptualMatches,
} from '@services/copyright-notices/staydown-matches'
import { getImageByIdFromPrimary } from '@services/images/get'
import { getImageFromS3 } from '@services/images/s3'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { computeStaydownDhash } from './staydown-dhash.mts'

export type ProcessStaydownHashDeps = {
  getImageFromS3: typeof getImageFromS3
  getDeployEnvironment: typeof getDeployEnvironment
}

const defaultDeps: ProcessStaydownHashDeps = { getImageFromS3, getDeployEnvironment }

/**
 * Hashes one image for copyright staydown. When the image is registered, its perceptual hash is
 * stored so later uploads can match it; when it resembles a registered image, staff review gets a
 * match. Both directions are idempotent, so a retry or a reconciliation replay changes nothing.
 * Does nothing while `copyright.staydownMatching` is off.
 */
export async function processStaydownHash(
  imageId: string,
  deps: Partial<ProcessStaydownHashDeps> = {},
): Promise<void> {
  const { getImageFromS3, getDeployEnvironment } = { ...defaultDeps, ...deps }
  if (!(await isCopyrightStaydownMatchingEnabled())) return
  const image = await getImageByIdFromPrimary(imageId)
  if (!image?.s3_key || !image.sha_256 || !image.upload_completed_at) return
  const s3Response = await getImageFromS3(getDeployEnvironment(), image.s3_key)
  if (!s3Response.Body) throw new Error('S3 response body is empty')
  const perceptualHash = await withTemporaryMediaFile(
    s3Response.Body as unknown as MediaBody,
    path => computeStaydownDhash(path),
    { prefix: 'staydown-hash-' },
  )
  if (!perceptualHash) return
  await fillCopyrightStaydownEntryHash({ imageId, perceptualHash })
  await recordCopyrightStaydownPerceptualMatches({ imageId, perceptualHash })
}
