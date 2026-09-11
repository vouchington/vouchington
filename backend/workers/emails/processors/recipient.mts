import type { EmailTemplateInput } from '@queues/emails/types'
import { getVerifiedEmailAddress } from '@services/contribution-gating'

export type ResolvedEmailRecipient =
  | { status: 'resolved'; emailAddress: string; userId: string | null }
  | { status: 'skipped'; reason: 'no_verified_email'; userId: string }

export async function resolveEmailRecipient(
  input: EmailTemplateInput,
): Promise<ResolvedEmailRecipient> {
  if (input.userId) {
    const emailAddress = await getVerifiedEmailAddress(input.userId)
    if (!emailAddress)
      return { status: 'skipped', reason: 'no_verified_email', userId: input.userId }
    return { status: 'resolved', emailAddress, userId: input.userId }
  }
  if ('emailAddress' in input && input.emailAddress) {
    return { status: 'resolved', emailAddress: input.emailAddress, userId: null }
  }
  throw new TypeError('Email job requires a recipient')
}

export function getDirectEmailAddress(input: EmailTemplateInput): string {
  if ('emailAddress' in input && input.emailAddress) return input.emailAddress
  throw new TypeError('Direct-address email job requires emailAddress')
}
