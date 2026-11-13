import type { PrivateUser } from '../services/users/types.mts'
import { copyrightEmailMessageId } from './services/copyright-notices/email-thread-cases.mts'
import { seedCopyrightPromotionThreadEmail } from './copyright-promotion-thread-fixtures.mts'
import { ownedCopyrightEmailPromotionInput } from './copyright-promotion-committed-fixtures.mts'

/** Independently owned root/reply facts for post-committed graph and replay observations. */
export async function createCopyrightPromotionRootReplyScene(
  moderator: PrivateUser,
  extraTokens = false,
) {
  const messageId = copyrightEmailMessageId()
  const root = await seedCopyrightPromotionThreadEmail({ messageId, replyReferences: [] })
  const reply = await seedCopyrightPromotionThreadEmail({
    messageId: copyrightEmailMessageId(),
    replyReferences: [
      messageId,
      ...(extraTokens ? [copyrightEmailMessageId(), copyrightEmailMessageId()] : []),
    ],
  })
  return { root, reply, input: await ownedCopyrightEmailPromotionInput(moderator, root.intakeId) }
}
