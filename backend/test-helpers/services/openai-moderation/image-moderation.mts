import type { OpenAI } from '@modules/openai-utils'
import { markImageComplete } from '../../entities/images.mts'
import { createImageUploadUrl } from '../../../services/images/create-upload-url.mts'
import { getImageByAny } from '../../../services/images/get.mts'

type CompletedModerationImage = {
  id: string
  s3_key: string
}

type ImageUploadDependencies = NonNullable<
  Parameters<typeof createImageUploadUrl>[1]['dependencies']
>

async function createCompletedModerationImage(
  user: { id: string },
  dependencies: ImageUploadDependencies,
): Promise<CompletedModerationImage> {
  const { image_id } = await createImageUploadUrl(user, {
    contentType: 'image/png',
    contentLength: 1024,
    dependencies,
  })
  await markImageComplete(image_id)
  const image = await getImageByAny(image_id)
  if (!image) throw new Error('Expected completed image')
  return { id: image.id, s3_key: image.s3_key }
}

function createImageModerationResult(
  flagged: boolean,
  overrides?: Partial<OpenAI.Moderation>,
): OpenAI.Moderation {
  return {
    flagged,
    categories: {
      harassment: false,
      'harassment/threatening': false,
      hate: false,
      'hate/threatening': false,
      illicit: false,
      'illicit/violent': false,
      'self-harm': false,
      'self-harm/instructions': false,
      'self-harm/intent': false,
      sexual: false,
      'sexual/minors': false,
      violence: false,
      'violence/graphic': false,
      ...overrides?.categories,
    },
    category_scores: {
      harassment: 0.0,
      'harassment/threatening': 0.0,
      hate: 0.0,
      'hate/threatening': 0.0,
      illicit: 0.0,
      'illicit/violent': 0.0,
      'self-harm': 0.0,
      'self-harm/instructions': 0.0,
      'self-harm/intent': 0.0,
      sexual: 0.0,
      'sexual/minors': 0.0,
      violence: 0.0,
      'violence/graphic': 0.0,
      ...overrides?.category_scores,
    },
    category_applied_input_types: {
      // Text-only categories do not apply when only image inputs are sent
      harassment: [],
      'harassment/threatening': [],
      hate: [],
      'hate/threatening': [],
      illicit: [],
      'illicit/violent': [],
      // Image-capable categories report 'image' when the input is an image URL
      'self-harm': ['image'],
      'self-harm/instructions': ['image'],
      'self-harm/intent': ['image'],
      sexual: ['image'],
      'sexual/minors': [],
      violence: ['image'],
      'violence/graphic': ['image'],
      ...overrides?.category_applied_input_types,
    },
    ...overrides,
  }
}

export { createCompletedModerationImage, createImageModerationResult }
