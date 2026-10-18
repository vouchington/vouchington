import type { WriteExclusion } from './mcp-write-exclusions-builder.mts'
import { accountExclusions } from './mcp-write-exclusions-account.mts'
import { adminApiExclusions } from './mcp-write-exclusions-admin-api.mts'
import { copyrightExclusions } from './mcp-write-exclusions-copyright.mts'
import { directStaffExclusions } from './mcp-write-exclusions-staff.mts'
import { undecidedExclusions } from './mcp-write-exclusions-undecided.mts'
import { mcpProtocolExclusions } from './mcp-write-exclusions-protocol.mts'

export { EXCLUSION_CATEGORIES, type WriteExclusion } from './mcp-write-exclusions-builder.mts'
export { communityOwnerAiExclusions } from './mcp-write-exclusions-community-owner.mts'

// Every explicit exclusion except the community owner rows, which derive from their predicate.
export const writeExclusions: readonly WriteExclusion[] = [
  ...directStaffExclusions,
  ...adminApiExclusions,
  ...mcpProtocolExclusions,
  ...copyrightExclusions,
  ...accountExclusions,
  ...undecidedExclusions,
]
