import { exclusions } from './mcp-write-exclusions-builder.mts'

// Each reason names the REST guard in backend/api/v1 and backend/services/*/authorization.mts.
// A guard that admits only `administrator` (or the system topic seed actor) is not a user write.
const admin = (guard: string, routes: string[]) =>
  exclusions('staff-only', `REST guard requires the administrator role (${guard})`, routes)

export const directStaffExclusions = [
  ...admin('isAdminUser', [
    'POST /curated-aside-items',
    'DELETE /curated-aside-items/:id',
    'PUT /curated-aside-items/order',
    'POST /hostnames',
    'PATCH /hostnames/:id',
    'PUT /users/:userId/preservation-hold',
    'DELETE /users/:userId/preservation-hold',
  ]),
  ...admin('currentUserCanGrantMembership', [
    'POST /membership-grants',
    'DELETE /membership-grants/:grantId',
  ]),
  ...admin('currentUserCanManageOfficialReferralLink', [
    'POST /referral-programs/:id/official-referral-links',
    'DELETE /official-referral-links/:linkId',
  ]),
  ...admin('currentUserCanCreateTopic', ['POST /topics']),
  ...admin('currentUserCanApplyReportAbusePenalty', [
    'POST /report-integrity/penalties/:id/reviews',
  ]),
  ...admin('currentUserCanApplyVoteRingPenalty', ['POST /vote-integrity/penalties/:id/reviews']),
  ...admin('currentUserCanUpdateTopic', [
    'PATCH /topics/:idOrSlug',
    'PATCH /topics/:idOrSlug/card',
    'PATCH /topics/:idOrSlug/referral-program',
    'PATCH /topics/:idOrSlug/retailer',
    'PUT /topics/:idOrSlug/retailer/countries',
    'PATCH /topics/:idOrSlug/rewards-program',
    'PATCH /topics/:idOrSlug/rewards-program-status',
    'PATCH /topics/:idOrSlug/spending-category',
    'PUT /topics/:idOrSlug/spending-category',
    'POST /topics/:idOrSlug/additional-hostnames',
    'DELETE /topics/:idOrSlug/additional-hostnames/:hostnameId',
    'POST /topics/:referralProgramId/referral-program/link-validations',
    'DELETE /topics/:referralProgramId/referral-program/link-validations/:validationId',
    'POST /topics/:referralProgramId/referral-program/validations',
    'POST /referral-link-validations',
    'PATCH /referral-link-validations/:idOrSlug',
    'DELETE /referral-link-validations/:idOrSlug',
    'POST /referral-link-validations/:validationId/rules',
    'PATCH /referral-link-validations/:validationId/rules/:ruleId',
    'DELETE /referral-link-validations/:validationId/rules/:ruleId',
  ]),
  ...admin('currentUserCanManageTopicAliases', [
    'POST /topics/:idOrSlug/aliases',
    'POST /topics/:idOrSlug/aliases/:aliasId',
    'DELETE /topics/:idOrSlug/aliases/:aliasId',
  ]),
  ...admin('currentUserCanMergeTopic', ['POST /topics/:sourceIdOrSlug/merges']),
  ...admin(
    'currentUserCanUpdateRssFeed, currentUserCanDeleteRssFeed, currentUserCanRefreshRssFeed',
    ['PATCH /rss-feeds/:id', 'DELETE /rss-feeds/:id', 'POST /rss-feeds/:id/refreshes'],
  ),
  ...admin('currentUserCanTriggerCrawl', ['POST /urls/:id/crawl']),
  ...admin('currentUserCanManageRecommendations', [
    'POST /topic-recommendations/:id/approvals',
    'POST /topic-recommendations/:id/rejections',
  ]),
  ...admin('currentUserCanModifyFediverseInstanceIntegrationStatus', [
    'POST /fediverse/instances/:id/integration-changes',
  ]),
  ...admin('currentUserCanManageBlacklist', [
    'POST /blacklist/source-sync',
    'POST /blacklist/dispatch',
  ]),
  ...admin('currentUserCanAccessPsqlAdmin', ['POST /psql/jobs']),
  ...admin('currentUserCanAccessValkeyAdmin', [
    'POST /valkey/bloom-filters/rebuild',
    'POST /valkey/caches/clear',
    'POST /valkey/flush',
  ]),
  ...exclusions(
    'staff-only',
    'REST guard requires the administrator or moderator role (isModerationStaff, currentUserCanRecordReveal, currentUserCanResolveReviewDispute)',
    [
      'DELETE /disputes/:id/annotation',
      'POST /moderation/reveals',
      'POST /communities/:idOrSlug/reports/:reportId/modmail',
    ],
  ),
]
