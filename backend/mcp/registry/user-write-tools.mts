import voteTool from '../vote.mts'
import setRssFeedItemReadTool from '../set-rss-feed-item-read.mts'
import shareRssFeedItemTool from '../share-rss-feed-item.mts'
import submitRssFeedTool from '../submit-rss-feed.mts'
import startDiscussionTool from '../start-discussion.mts'
import { communityReportAppealWriteTools } from './community-report-appeal-write-tools.mts'
import { postWriteTools } from './post-write-tools.mts'

/** The user MCP write tools that create or change content the credential owner authors. */
export const userWriteTools = [
  ...postWriteTools,
  voteTool,
  ...communityReportAppealWriteTools,
  setRssFeedItemReadTool,
  shareRssFeedItemTool,
  submitRssFeedTool,
  startDiscussionTool,
]
