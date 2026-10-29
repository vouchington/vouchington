import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

/** The bypass decision is current post state, independent of expiring transition history. */
export async function seedPostCreationModerationBypass(): Promise<void> {
  await write(
    `/* seedExplainData */ UPDATE posts
     SET has_creation_moderation_bypass = TRUE
     WHERE id = $1 AND has_creation_moderation_bypass = FALSE`,
    [seedUuid(0, '05')],
  )
}
