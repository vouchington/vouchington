import { exclusions } from './mcp-write-exclusions-builder.mts'

// Ordinary-user product writes with no tool and no recorded exclusion. #208 cannot close until
// each row here becomes a tool option or moves to a recorded category with a reason.
const pending = (routes: string[]) => exclusions('undecided', 'Tool decision pending #208', routes)

export const undecidedExclusions = [
  ...pending([
    'POST /topics/:idOrSlug/claims',
    'POST /topics/:idOrSlug/claims/:claimId/domain-verification',
    'POST /topics/:idOrSlug/claims/:claimId/manual-review-submission',
    'POST /topics/:idOrSlug/claims/:claimId/verification-token',
    'POST /my/import/topics',
    'POST /lists/:id/import',
  ]),
  ...pending([
    'POST /households',
    'DELETE /households/:id',
    'POST /households/:id/memberships',
    'DELETE /households/:id/memberships/:membershipId',
  ]),
]
