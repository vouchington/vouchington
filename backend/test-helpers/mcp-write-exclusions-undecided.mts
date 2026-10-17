import { exclusions } from './mcp-write-exclusions-builder.mts'

// Ordinary-user product writes with no tool and no recorded exclusion. #208 cannot close until
// each row here becomes a tool option or moves to a recorded category with a reason.
const pending = (routes: string[]) => exclusions('undecided', 'Tool decision pending #208', routes)

export const undecidedExclusions = [
  ...pending([
    'PUT /posts/:id/read',
    'DELETE /posts/:id/read',
    'POST /posts/:idOrSlug/lock',
    'DELETE /posts/:idOrSlug/lock',
    'POST /posts/:idOrSlug/ratings',
    'PATCH /posts/:idOrSlug/ratings/:topicId',
    'DELETE /posts/:idOrSlug/ratings/:topicId',
    'POST /posts/:idOrSlug/sends',
    'POST /posts/:idOrSlug/shares',
    'PUT /posts/:idOrSlug/images',
    'PUT /hostnames/:id/vote',
    'DELETE /hostnames/:id/vote',
    'PUT /users/:id/vouch-vote',
    'DELETE /users/:id/vouch-vote',
    'POST /fediverse/instances',
    'POST /topics/:idOrSlug/claims',
    'POST /topics/:idOrSlug/claims/:claimId/domain-verification',
    'POST /topics/:idOrSlug/claims/:claimId/manual-review-submission',
    'POST /topics/:idOrSlug/claims/:claimId/verification-token',
    'PUT /podcast-episodes/:id/playback-position',
    'POST /rss-feeds/:rssFeedId/views',
    'POST /rss-feed-items/:id/views',
    'POST /images/upload-url',
    'POST /images/:id/completions',
    'POST /my/import/rss-feeds',
    'POST /my/import/topics',
    'POST /lists/:id/import',
    'POST /users/:idOrSlug/data-request',
  ]),
  ...pending([
    'POST /my/messages',
    'PATCH /my/messages/:conversationId',
    'POST /my/messages/:conversationId/messages',
    'POST /my/messages/:conversationId/participants',
    'DELETE /my/messages/:conversationId/participants/:userId',
    'PATCH /my/conversations/:conversationId',
    'DELETE /my/conversations/:conversationId',
    'POST /my/conversations/:conversationId/title',
    'POST /conversations',
    'POST /conversations/:conversationId/client-generated-chat',
    'POST /households',
    'PATCH /households/:id',
    'DELETE /households/:id',
    'POST /households/:id/memberships',
    'DELETE /households/:id/memberships/:membershipId',
  ]),
  ...exclusions(
    'undecided',
    'Community modmail open or reply, open to members and moderators; tool decision pending #208',
    [
      'POST /communities/:idOrSlug/modmail',
      'POST /communities/:idOrSlug/modmail/:conversationId/messages',
    ],
  ),
  ...exclusions(
    'undecided',
    'Community moderator write outside the moderator tools; tool decision pending #208',
    ['POST /communities/:idOrSlug/ban-evasion/:userId'],
  ),
  ...exclusions(
    'undecided',
    'Guard admits site staff and any community moderator, not only staff; tool decision pending #208',
    ['POST /users/:userId/mod-notes', 'DELETE /users/:userId/mod-notes/:noteId'],
  ),
]
