import {
  createTopicClaim,
  issueDomainVerificationToken,
  getReadableTopicClaim,
  listTopicClaimsForUser,
  requireTopicClaimOnTopic,
  submitTopicClaimForManualReview,
  verifyTopicClaimDomain,
} from '@services/topic-claims'
import { parseCreateTopicClaimInput } from '@services/topic-claims/parse'
import { createMergedTool } from '../create-merged-tool.mts'
import { claimWithState, topicClaimSource } from './topic-claim-source.mts'

const topic = { type: 'string', description: 'Topic id or slug.' }
const claimId = { type: 'string', format: 'uuid', description: 'Topic claim id.' }
const claimedRole = { type: 'string', description: 'Role the caller claims, such as Issuer.' }
const evidence = {
  type: 'string',
  maxLength: 10000,
  description: 'Evidence text, at most 10000 characters.',
}
const claimRef = { topic, claim_id: claimId }

export const readMyTopicClaimsGroup = {
  name: 'read_my_topic_claims',
  options: [
    {
      option: 'list',
      source: topicClaimSource<{
        limit?: number
        after?: string
        topic_ids?: string[]
        verified_only?: boolean
      }>(
        'List a page of the caller’s topic claims with state. Continue with page_info.end_cursor; optionally filter to topic_ids and live verified claims.',
        { method: 'GET', path: '/api/v1/my/topic-claims' },
        {
          limit: { type: 'integer', minimum: 1, description: 'Page size; the server clamps it.' },
          after: { type: 'string', description: 'Opaque cursor from the previous page.' },
          topic_ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 100 },
          verified_only: { type: 'boolean' },
        },
        [],
        async (user, args) => {
          const page = await listTopicClaimsForUser(user.id, {
            limit: args.limit,
            after: args.after,
            topicIds: args.topic_ids,
            verifiedOnly: args.verified_only,
          })
          return { results: page.results.map(claimWithState), page_info: page.page_info }
        },
        false,
      ),
    },
    {
      option: 'get',
      source: topicClaimSource<{ topic: string; claim_id: string }>(
        'Read a topic claim by topic id or slug and claim_id. Another claimant’s claim is not found unless the caller is moderation staff.',
        { method: 'GET', path: '/api/v1/topics/:idOrSlug/claims/:claimId' },
        claimRef,
        ['topic', 'claim_id'],
        async (user, args) => ({
          claim: claimWithState(await getReadableTopicClaim(user, args.topic, args.claim_id)),
        }),
        false,
      ),
    },
  ],
}

export const manageTopicClaimGroup = {
  name: 'manage_topic_claim',
  options: [
    {
      option: 'create',
      source: topicClaimSource<{ topic: string; claimed_role: string; evidence?: string }>(
        'File a topic claim for a topic id or slug with claimed_role and optional evidence. This does not grant ownership.',
        { method: 'POST', path: '/api/v1/topics/:idOrSlug/claims' },
        { topic, claimed_role: claimedRole, evidence },
        ['topic', 'claimed_role'],
        async (user, args) => {
          const { claim, isDuplicate } = await createTopicClaim(
            user.id,
            parseCreateTopicClaimInput({
              topic_id: args.topic,
              claimed_role: args.claimed_role,
              evidence: args.evidence,
            }),
          )
          return { claim: claimWithState(claim), isDuplicate }
        },
        true,
      ),
    },
    {
      option: 'issue_verification_token',
      source: topicClaimSource<{ topic: string; claim_id: string }>(
        'Issue the domain-verification token for claim_id on a topic id or slug.',
        { method: 'POST', path: '/api/v1/topics/:idOrSlug/claims/:claimId/verification-token' },
        claimRef,
        ['topic', 'claim_id'],
        async (user, args) => {
          const claimContext = await requireTopicClaimOnTopic(args.topic, args.claim_id)
          return issueDomainVerificationToken(user.id, claimContext)
        },
        true,
      ),
    },
    {
      option: 'verify_domain',
      source: topicClaimSource<{ topic: string; claim_id: string }>(
        'Check the published DNS TXT record or well-known file for claim_id on a topic id or slug.',
        { method: 'POST', path: '/api/v1/topics/:idOrSlug/claims/:claimId/domain-verification' },
        claimRef,
        ['topic', 'claim_id'],
        async (user, args) => {
          const claimContext = await requireTopicClaimOnTopic(args.topic, args.claim_id)
          return { claim: claimWithState(await verifyTopicClaimDomain(user.id, claimContext)) }
        },
        true,
      ),
    },
    {
      option: 'submit_manual_review',
      source: topicClaimSource<{ topic: string; claim_id: string; evidence: string }>(
        'Submit claim_id on a topic id or slug for staff review with evidence. This does not grant ownership.',
        {
          method: 'POST',
          path: '/api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission',
        },
        { ...claimRef, evidence },
        ['topic', 'claim_id', 'evidence'],
        async (user, args) => {
          const claimContext = await requireTopicClaimOnTopic(args.topic, args.claim_id)
          return {
            claim: claimWithState(
              await submitTopicClaimForManualReview(user.id, claimContext, args.evidence),
            ),
          }
        },
        true,
      ),
    },
  ],
}

export const brandTopicClaimGroups = [readMyTopicClaimsGroup, manageTopicClaimGroup]

export const brandTopicClaimTools = [
  createMergedTool(
    readMyTopicClaimsGroup.name,
    'Read My Topic Claims',
    readMyTopicClaimsGroup.options,
  ),
  createMergedTool(manageTopicClaimGroup.name, 'Manage Topic Claim', manageTopicClaimGroup.options),
]
