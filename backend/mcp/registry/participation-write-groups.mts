import { participateInCommunityGroup } from '../participate-in-community.mts'
import { voteGroup } from '../vote.mts'
import { rssReadStateGroup } from '../set-rss-feed-item-read.mts'
import { shareRssFeedItemGroup } from '../share-rss-feed-item.mts'
import { submitRssFeedGroup } from '../submit-rss-feed.mts'
import { startDiscussionGroup } from '../start-discussion.mts'

export const participationWriteGroups = [
  voteGroup,
  rssReadStateGroup,
  shareRssFeedItemGroup,
  submitRssFeedGroup,
  startDiscussionGroup,
  participateInCommunityGroup,
] as const
