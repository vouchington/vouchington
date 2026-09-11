import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import type { QueryOptions } from '@data-stores/psql/types'
import { getUrlById } from '@services/urls'
import { getRegisteredImageExistsGuard } from './image-exists-guard-registry.mts'
import type { CreateTopicUpdates } from './types.mts'
import { assertReferralProgramExists, assertRewardsProgramExists } from './validation.mts'

export async function assertValidTopicReferences(
  changes: Partial<CreateTopicUpdates>,
  options: QueryOptions,
): Promise<void> {
  if (changes.homepage_url_id !== undefined && changes.homepage_url_id !== null) {
    assert(isUUID(changes.homepage_url_id), 422, 'Invalid homepage_url_id')
    const url = await getUrlById(changes.homepage_url_id, options)
    assert(url, 422, 'homepage_url_id does not reference a known URL')
  }
  if (changes.logo_image_id !== undefined && changes.logo_image_id !== null) {
    assert(isUUID(changes.logo_image_id), 422, 'Invalid logo_image_id')
    await getRegisteredImageExistsGuard()(changes.logo_image_id)
  }
  if (changes.hero_image_id !== undefined && changes.hero_image_id !== null) {
    assert(isUUID(changes.hero_image_id), 422, 'Invalid hero_image_id')
    await getRegisteredImageExistsGuard()(changes.hero_image_id)
  }
  if (changes.rewards_program_id !== undefined && changes.rewards_program_id !== null) {
    await assertRewardsProgramExists(changes.rewards_program_id, 'rewards_program_id')
  }
  if (changes.referral_program_id !== undefined && changes.referral_program_id !== null) {
    await assertReferralProgramExists(changes.referral_program_id, 'referral_program_id')
  }
}
