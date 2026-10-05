import { communityReportAppealWriteTools } from './community-report-appeal-write-tools.mts'
import { postWriteTools } from './post-write-tools.mts'

/** The user MCP write tools that create or change content the credential owner authors. */
export const userWriteTools = [...postWriteTools, ...communityReportAppealWriteTools]
