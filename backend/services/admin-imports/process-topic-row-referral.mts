import {
  enableReferralProgram,
  linkValidationToReferralProgram,
} from '@services/topics/referral-programs'
import {
  getReferralLinkValidationBySlug,
  createReferralLinkValidation,
} from '@services/referral-program-link-validations/validations'
import { upsertReferralLinkValidationRule } from '@services/referral-program-link-validations/rules/upsert'
import { getTopicBySlug } from '@services/topics/get'
import type { PrivateUser } from '@services/users/types'
import type { TopicImportRow } from './types.mts'

export async function processReferralProgramAttributes(
  admin: PrivateUser,
  topicId: string,
  input: TopicImportRow,
): Promise<void> {
  const validationSlug = input.referral_validation_slug!.trim()
  const hostname = input.referral_hostname!.trim()
  const pathname = input.referral_pathname!.trim()
  const exampleUrl = input.referral_example_url?.trim() || null
  const companySlug = input.referral_company_slug?.trim() || null
  const companyId = companySlug ? await getCompanyTopicId(companySlug) : undefined

  await enableReferralProgram(topicId, companyId)

  const validation =
    (await getReferralLinkValidationBySlug(validationSlug)) ??
    (await createReferralLinkValidation(admin, {
      slug: validationSlug,
      user_help_text: input.referral_user_help_text?.trim() ?? '',
    }))

  await upsertReferralLinkValidationRule(validation.id, {
    hostname,
    pathname,
    example_urls: exampleUrl ? [exampleUrl] : null,
  })

  await linkValidationToReferralProgram(admin, topicId, validation.id)
}

async function getCompanyTopicId(companySlug: string) {
  const companyTopic = await getTopicBySlug(companySlug)
  if (!companyTopic) {
    throw new Error(`referral_company_slug "${companySlug}" does not match any topic`)
  }
  return companyTopic.id
}
