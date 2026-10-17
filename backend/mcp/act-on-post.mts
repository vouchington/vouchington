import { createMergedTool } from './create-merged-tool.mts'
import { updatePostSource } from './act-on-post/edit.mts'
import {
  addPostRatingSource,
  deletePostRatingSource,
  editPostRatingSource,
} from './act-on-post/ratings.mts'
import {
  markPostReadSource,
  markPostUnreadSource,
  sendPostSource,
  sharePostSource,
} from './act-on-post/delivery.mts'

/** One MCP name for the Plus member's actions on a post that share the post write grant. */
export const actOnPostGroup = {
  name: 'act_on_post',
  options: [
    { option: 'edit', source: updatePostSource },
    { option: 'add_rating', source: addPostRatingSource },
    { option: 'edit_rating', source: editPostRatingSource },
    { option: 'delete_rating', source: deletePostRatingSource },
    { option: 'share', source: sharePostSource },
    { option: 'send', source: sendPostSource },
    { option: 'read', source: markPostReadSource },
    { option: 'unread', source: markPostUnreadSource },
  ],
} as const

export default createMergedTool(actOnPostGroup.name, 'Act on Post', actOnPostGroup.options)
