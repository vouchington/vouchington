import type { WriteExclusion } from './mcp-write-exclusions-builder.mts'
import { accountExclusions } from './mcp-write-exclusions-account.mts'
import { adminToolOnlyExclusions } from './mcp-write-exclusions-admin-tools.mts'
import { copyrightExclusions } from './mcp-write-exclusions-copyright.mts'
import { directStaffExclusions } from './mcp-write-exclusions-staff.mts'
import { undecidedExclusions } from './mcp-write-exclusions-undecided.mts'

export { EXCLUSION_CATEGORIES, type WriteExclusion } from './mcp-write-exclusions-builder.mts'
export { communityOwnerAiExclusions } from './mcp-write-exclusions-community-owner.mts'

// Admin-surface routes are excluded by prefix instead of by row.
export const ADMIN_SURFACE_PREFIX = '/api/v1/admin/'

// Every explicit exclusion except the community owner rows, which derive from their predicate.
export const writeExclusions: readonly WriteExclusion[] = [
  ...directStaffExclusions,
  ...adminToolOnlyExclusions,
  ...copyrightExclusions,
  ...accountExclusions,
  ...undecidedExclusions,
]
