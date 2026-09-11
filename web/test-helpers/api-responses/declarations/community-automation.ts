import communitiesAutomodFeedbackCreateDefault from '../../../../api-fixtures/v1/responses/web.communities.automod-feedback.create.default.json'
import communitiesAutomodRecentActionsDefault from '../../../../api-fixtures/v1/responses/web.communities.automod-recent-actions.default.json'
import communitiesAutomodSimulateDefault from '../../../../api-fixtures/v1/responses/web.communities.automod-simulate.default.json'
import communitiesModerationResultsDefault from '../../../../api-fixtures/v1/responses/web.communities.moderation-results.default.json'
import communitiesPostTypeSettingsUpdateDefault from '../../../../api-fixtures/v1/responses/web.communities.post-type-settings.update.default.json'
import communitiesSavedRepliesDefault from '../../../../api-fixtures/v1/responses/web.communities.saved-replies.default.json'
import communitiesSavedReplyCreateDefault from '../../../../api-fixtures/v1/responses/web.communities.saved-reply.create.default.json'
import communitiesWarningCreateDefault from '../../../../api-fixtures/v1/responses/web.communities.warning.create.default.json'
import nativeCommunityPendingReportsPaginated from '../../../../api-fixtures/v1/responses/native.community.pending-reports.paginated.json'
import type {
  CommunityAutomodActionsResponseBody,
  CommunityAutomodFeedbackResponseBody,
  CommunityAutomodSimulationResponseBody,
  CommunityModerationReportsResponseBody,
  CommunityPostTypeSettingsResponseBody,
} from '@/types/api-responses'
import type { SavedRepliesResponseBody, SavedReply } from '@/lib/api/client/modmail'
import type { CommunityIssueUserWarningResponse } from '@/lib/api/client/warnings'
import {
  defineWebApiFixture,
  type WebApiFixtureDeclaration,
  type CommunityModerationResultsFixture,
} from './declaration'

const pendingReportsFixture =
  nativeCommunityPendingReportsPaginated as unknown as CommunityModerationReportsResponseBody

const automodRecentActionsFixture =
  communitiesAutomodRecentActionsDefault as unknown as CommunityAutomodActionsResponseBody

export const COMMUNITY_AUTOMATION_DECLARATIONS = [
  defineWebApiFixture<CommunityModerationReportsResponseBody>()(
    'native.community.pending-reports.paginated',
    pendingReportsFixture,
    context =>
      context.client.reports.getCommunityPendingModerationReportsClient('fixture-community', {
        after: 'fixture-community-role-and-sort-scoped-report-cursor',
        limit: 1,
        sort: 'created_at_desc',
      }),
    [
      context =>
        context.server.reports.getCommunityPendingModerationReports('fixture-community', {
          searchParams: {
            after: 'fixture-community-role-and-sort-scoped-report-cursor',
            limit: 1,
            sort: 'created_at_desc',
          },
        }),
    ],
  ),
  defineWebApiFixture<CommunityAutomodFeedbackResponseBody>()(
    'web.communities.automod-feedback.create.default',
    communitiesAutomodFeedbackCreateDefault,
    context =>
      context.client.communityAutomod.recordCommunityAutomodFeedback(
        'test-community',
        'agent_moderation:post-1',
        {
          outcome: 'true_positive',
          action: 'keep_removed',
          reason_code: 'correct',
          note: 'Matches the community rules.',
        },
      ),
  ),
  defineWebApiFixture<CommunityAutomodActionsResponseBody>()(
    'web.communities.automod-recent-actions.default',
    automodRecentActionsFixture,
    context =>
      context.server.communityAutomod.getCommunityAutomodRecentActions('test-community', {
        searchParams: { window: '24h', limit: 25, source: 'agent_moderation' },
      }),
  ),
  defineWebApiFixture<CommunityAutomodSimulationResponseBody>()(
    'web.communities.automod-simulate.default',
    communitiesAutomodSimulateDefault,
    context =>
      context.client.communityAgentPrompts.simulateCommunityAutomod('test-community', {
        prompt_id: 'prompt-1',
      }),
  ),
  defineWebApiFixture<CommunityModerationResultsFixture>()(
    'web.communities.moderation-results.default',
    communitiesModerationResultsDefault,
    context =>
      context.rawServer.get<CommunityModerationResultsFixture>(
        '/api/v1/communities/test-community/posts/post-1/moderation-results',
      ),
  ),
  defineWebApiFixture<CommunityPostTypeSettingsResponseBody>()(
    'web.communities.post-type-settings.update.default',
    communitiesPostTypeSettingsUpdateDefault,
    context =>
      context.client.communities.updateCommunityPostTypeSettings('test-community', {
        allow_review_posts: true,
        allow_data_point_posts: true,
      }),
  ),
  defineWebApiFixture<SavedRepliesResponseBody>()(
    'web.communities.saved-replies.default',
    communitiesSavedRepliesDefault,
    context => context.client.modmail.getCommunitySavedReplies('test-community'),
  ),
  defineWebApiFixture<{ reply: SavedReply }>()(
    'web.communities.saved-reply.create.default',
    communitiesSavedReplyCreateDefault,
    context =>
      context.client.modmail.createSavedReply(
        'test-community',
        'Greeting',
        'Thanks for writing in.',
      ),
  ),
  defineWebApiFixture<CommunityIssueUserWarningResponse>()(
    'web.communities.warning.create.default',
    communitiesWarningCreateDefault,
    context =>
      context.client.warnings.issueCommunityUserWarning('test-community', {
        userId: 'user-1',
        reason: 'Spam in community',
        publicMessage: 'Please read the community rules.',
        resolveReport: false,
      }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
