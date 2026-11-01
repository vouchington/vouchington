import '@/test-helpers/i18n/mock-json-messages'
import '@/test-helpers/lib/routes/thin-route-coverage.mock-support'
import { assert, describe, expect, it } from 'vitest'

// Static imports execute each thin route's module-level factory call.
// The static route coverage check owns the complete file inventory.

import * as articleIdCommentCommentIdPage from '../../../app/(posts)/article/[id]/comment/[commentId]/page'
import * as articleIdEditPage from '../../../app/(posts)/article/[id]/edit/page'
import * as articleIdPage from '../../../app/(posts)/article/[id]/page'
import * as articleIdTagsObjectTypePage from '../../../app/(posts)/article/[id]/tags/[objectType]/page'
import * as blogPostIdCommentCommentIdPage from '../../../app/(posts)/blog-post/[id]/comment/[commentId]/page'
import * as blogPostIdEditPage from '../../../app/(posts)/blog-post/[id]/edit/page'
import * as blogPostIdPage from '../../../app/(posts)/blog-post/[id]/page'
import * as blogPostIdTagsObjectTypePage from '../../../app/(posts)/blog-post/[id]/tags/[objectType]/page'
import * as dataPointIdCommentCommentIdPage from '../../../app/(posts)/data-point/[id]/comment/[commentId]/page'
import * as dataPointIdEditPage from '../../../app/(posts)/data-point/[id]/edit/page'
import * as dataPointIdPage from '../../../app/(posts)/data-point/[id]/page'
import * as dataPointIdTagsObjectTypePage from '../../../app/(posts)/data-point/[id]/tags/[objectType]/page'
import * as discussionIdCommentCommentIdPage from '../../../app/(posts)/discussion/[id]/comment/[commentId]/page'
import * as discussionIdEditPage from '../../../app/(posts)/discussion/[id]/edit/page'
import * as discussionIdPage from '../../../app/(posts)/discussion/[id]/page'
import * as discussionIdTagsObjectTypePage from '../../../app/(posts)/discussion/[id]/tags/[objectType]/page'
import * as linkIdCommentCommentIdPage from '../../../app/(posts)/link/[id]/comment/[commentId]/page'
import * as linkIdPage from '../../../app/(posts)/link/[id]/page'
import * as linkIdTagsObjectTypePage from '../../../app/(posts)/link/[id]/tags/[objectType]/page'
import * as reviewIdCommentCommentIdPage from '../../../app/(posts)/review/[id]/comment/[commentId]/page'
import * as reviewIdEditPage from '../../../app/(posts)/review/[id]/edit/page'
import * as reviewIdPage from '../../../app/(posts)/review/[id]/page'
import * as reviewIdTagsObjectTypePage from '../../../app/(posts)/review/[id]/tags/[objectType]/page'
import * as storyIdCommentCommentIdPage from '../../../app/(posts)/story/[id]/comment/[commentId]/page'
import * as storyIdPage from '../../../app/(posts)/story/[id]/page'
import * as storyIdTagsObjectTypePage from '../../../app/(posts)/story/[id]/tags/[objectType]/page'

const postRoutes = [
  articleIdCommentCommentIdPage,
  articleIdEditPage,
  articleIdPage,
  articleIdTagsObjectTypePage,
  blogPostIdCommentCommentIdPage,
  blogPostIdEditPage,
  blogPostIdPage,
  blogPostIdTagsObjectTypePage,
  dataPointIdCommentCommentIdPage,
  dataPointIdEditPage,
  dataPointIdPage,
  dataPointIdTagsObjectTypePage,
  discussionIdCommentCommentIdPage,
  discussionIdEditPage,
  discussionIdPage,
  discussionIdTagsObjectTypePage,
  linkIdCommentCommentIdPage,
  linkIdPage,
  linkIdTagsObjectTypePage,
  reviewIdCommentCommentIdPage,
  reviewIdEditPage,
  reviewIdPage,
  reviewIdTagsObjectTypePage,
  storyIdCommentCommentIdPage,
  storyIdPage,
  storyIdTagsObjectTypePage,
]

describe('post route modules load and export defaults', () => {
  it('exports a default component from each thin route module', () => {
    expect(postRoutes.length).toBeGreaterThan(0)
    for (const route of postRoutes) {
      assert(route.default !== undefined, 'thin route module must export default')
    }
  })
})
