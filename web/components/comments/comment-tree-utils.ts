import type { Post, PostElection, ElectionVote } from '@/types/posts'
import type { AgentModeration, AgentModerationElection } from '@/types/agents'

type CommentTreeNode = Post & { children: CommentTreeNode[] }

export interface CommentNodeData {
  post: Post
  children: CommentNodeData[]
  html: string | null
  election?: PostElection | undefined
  electionVote?: ElectionVote | undefined
  moderations?: AgentModeration[] | undefined
  moderationElections?: Record<string, AgentModerationElection> | undefined
  moderationElectionVotes?: Record<string, ElectionVote> | undefined
  communityName?: string | undefined
  bookmarks?: Record<string, boolean> | undefined
}

export function buildTree(
  results: Array<{ id: string }>,
  postsMap: Record<string, Post>,
): CommentTreeNode[] {
  const nodes: Record<string, CommentTreeNode> = {}
  const roots: CommentTreeNode[] = []

  for (const result of results) {
    const post = postsMap[result.id]
    if (!post) continue
    nodes[result.id] = { ...post, children: [] }
  }

  for (const result of results) {
    const node = nodes[result.id]
    if (!node) continue

    const parentId = node.parent_id
    if (parentId && nodes[parentId]) {
      nodes[parentId].children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

export function buildCommentNodeData(
  comment: CommentTreeNode,
  options: {
    markdownToHtml: Record<string, string>
    electionsMap: Record<string, PostElection>
    electionVotesMap: Record<string, ElectionVote>
    postModerations?: Record<string, AgentModeration[]> | undefined
    moderationElections?: Record<string, AgentModerationElection> | undefined
    communityNamesMap?: Record<string, string> | undefined
    bookmarks?: Record<string, Record<string, boolean>> | undefined
  },
): CommentNodeData {
  const { children, ...post } = comment
  const moderations = options.postModerations?.[comment.id]
  const moderationElections = moderations
    ? moderations.reduce<Record<string, AgentModerationElection>>((acc, moderation) => {
        const election = options.moderationElections?.[moderation.id]
        if (election) acc[moderation.id] = election
        return acc
      }, {})
    : undefined
  const moderationElectionVotes = moderations
    ? moderations.reduce<Record<string, ElectionVote>>((acc, moderation) => {
        const vote = options.electionVotesMap[moderation.id]
        if (vote) acc[moderation.id] = vote
        return acc
      }, {})
    : undefined

  return {
    post,
    children: children.map(child => buildCommentNodeData(child, options)),
    html: options.markdownToHtml[comment.id] ?? null,
    election: options.electionsMap[comment.id],
    electionVote: options.electionVotesMap[comment.id],
    moderations,
    moderationElections,
    moderationElectionVotes,
    communityName: comment.community_id
      ? options.communityNamesMap?.[comment.community_id]
      : undefined,
    bookmarks: options.bookmarks?.[comment.id],
  }
}

export function buildQuoteMarkdown(
  comment: Post,
  rootPostType: string,
  rootPostId: string,
): string {
  const text = comment.markdown ?? ''
  const permalink = `/${rootPostType}/${rootPostId}/comment/${comment.id}`
  const quoted = text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')
  return `${quoted}\n\n[→ view comment](${permalink})\n\n`
}
