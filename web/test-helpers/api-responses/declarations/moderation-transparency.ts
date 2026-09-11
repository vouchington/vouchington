import moderationTransparencyDefault from '../../../../api-fixtures/v1/responses/native.moderation.transparency.default.json'
import communityModerationTransparencyDefault from '../../../../api-fixtures/v1/responses/native.community.moderation-transparency.default.json'
import type { ModerationTransparency } from '@/types/api-responses'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const MODERATION_TRANSPARENCY_DECLARATIONS = [
  defineWebApiFixture<ModerationTransparency>()(
    'native.moderation.transparency.default',
    moderationTransparencyDefault,
    context => context.server.moderationAnalytics.getModerationTransparency({ range: '30d' }),
  ),
  defineWebApiFixture<ModerationTransparency>()(
    'native.community.moderation-transparency.default',
    communityModerationTransparencyDefault,
    context =>
      context.server.moderationAnalytics.getCommunityModerationTransparency('fixture-community', {
        range: '30d',
      }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
