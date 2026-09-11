import { createCodedError } from '@modules/on-error/create-coded-error'
import { TOPICS_IMAGE_EXISTS_GUARD_UNREGISTERED } from '@modules/on-error/error-codes'

export type ImageExistsGuard = (imageId: string) => Promise<void>

let registeredGuard: ImageExistsGuard | null = null

// @services/images registers its existence check here as a side effect of module load (see
// backend/services/images/register-image-exists-guard.mts) so topics never imports images
// directly, which would recreate a workspace dependency cycle between the two packages.
export function registerImageExistsGuard(guard: ImageExistsGuard): void {
  registeredGuard = guard
}

// Internal to topics: only update-field-references.mts should call this. Throws instead of
// letting a topic logo/hero image update silently skip the image-existence check when the
// registration above never ran (e.g. a missing side-effect import at process boot).
export function getRegisteredImageExistsGuard(): ImageExistsGuard {
  if (!registeredGuard) {
    throw createCodedError(
      500,
      'No image-exists guard registered for topics; @services/images must be imported for side effects before topic image field updates occur',
      TOPICS_IMAGE_EXISTS_GUARD_UNREGISTERED,
    )
  }
  return registeredGuard
}
