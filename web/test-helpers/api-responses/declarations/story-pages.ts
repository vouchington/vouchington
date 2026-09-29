import nativeStoryGetDefault from '../../../../api-fixtures/v1/responses/native.stories.get.default.json'
import nativeStoryGetAfter from '../../../../api-fixtures/v1/responses/native.stories.get.after.json'
import type { StoryPageResponse } from '@/types/rss-feed-items'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const STORY_PAGE_DECLARATIONS = [
  defineWebApiFixture<StoryPageResponse>()(
    'native.stories.get.default',
    nativeStoryGetDefault as unknown as StoryPageResponse,
    context =>
      context.client.stories.getStoryMemberPage('01950000-0000-7000-8000-000000000001', {
        limit: 1,
        excludeItemId: '01950000-0000-7000-8000-000000000010',
      }),
  ),
  defineWebApiFixture<StoryPageResponse>()(
    'native.stories.get.after',
    nativeStoryGetAfter as unknown as StoryPageResponse,
    context =>
      context.client.stories.getStoryMemberPage('01950000-0000-7000-8000-000000000001', {
        after: nativeStoryGetDefault.page_info.end_cursor,
        excludeItemId: '01950000-0000-7000-8000-000000000010',
      }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
