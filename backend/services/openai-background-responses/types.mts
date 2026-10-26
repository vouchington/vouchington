/** Metadata persisted with an AI job until its OpenAI response is settled. */
export interface BackgroundResponseToReconcile {
  responseId: string
  agentSlug: string
  communityId: string | null
  postId: string | null
  createdAt: Date
}
