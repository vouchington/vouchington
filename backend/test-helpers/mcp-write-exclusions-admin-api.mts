import { exclusions } from './mcp-write-exclusions-builder.mts'

// Admin REST actions without an MCP tool stay individually visible in #208's inventory.
export const adminApiExclusions = [
  ...exclusions(
    'staff-only',
    'Staff-only OAuth client verification lifecycle; no MCP tool exposes client verification',
    ['DELETE /admin/oauth-clients/:id/verification', 'PUT /admin/oauth-clients/:id/verification'],
  ),
  ...exclusions(
    'staff-only',
    'Staff-only classifier threshold maintenance; no MCP tool exposes classifier operations',
    [
      'POST /admin/classifiers/:classifierId/candidates/:candidateId/threshold/rollback',
      'PUT /admin/classifiers/:classifierId/candidates/:candidateId/threshold',
    ],
  ),
  ...exclusions(
    'sensitive-account',
    'Staff-only identity verification attempt recorded outside the MCP tool surface',
    ['POST /admin/users/:userId/identity-verification-attempts'],
  ),
]
