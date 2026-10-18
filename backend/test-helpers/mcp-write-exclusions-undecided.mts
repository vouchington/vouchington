import { exclusions } from './mcp-write-exclusions-builder.mts'

// Ordinary-user product writes with no tool and no recorded exclusion. #208 cannot close until
// each row here becomes a tool option or moves to a recorded category with a reason.
const pending = (routes: string[]) => exclusions('undecided', 'Tool decision pending #208', routes)

export const undecidedExclusions = [
  ...pending([
    'PUT /posts/:id/read',
    'DELETE /posts/:id/read',
    'POST /posts/:idOrSlug/ratings',
    'PATCH /posts/:idOrSlug/ratings/:topicId',
    'DELETE /posts/:idOrSlug/ratings/:topicId',
    'POST /posts/:idOrSlug/sends',
    'POST /posts/:idOrSlug/shares',
    'PUT /posts/:idOrSlug/images',
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
    'POST /households',
    'PATCH /households/:id',
    'DELETE /households/:id',
    'POST /households/:id/memberships',
    'DELETE /households/:id/memberships/:membershipId',
  ]),
]
