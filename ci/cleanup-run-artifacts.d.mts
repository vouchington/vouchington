type Artifact = {
  expired: boolean
  id: number
  name: string
  size_in_bytes: number
}

type Repository = {
  owner: string
  repo: string
}

type GithubClient = {
  paginate(method: unknown, params: Record<string, unknown>): Promise<Artifact[]>
  rest: {
    actions: {
      deleteArtifact(params: Record<string, unknown>): Promise<unknown>
      listWorkflowRunArtifacts: unknown
    }
  }
}

type CleanupLog = {
  info(message: string): void
  warning(message: string): void
}

type DeletionSummary = {
  bytesFreed: number
  deletedCount: number
}

export function cleanupRunArtifacts(request: {
  github: GithubClient
  log?: CleanupLog
  repo: Repository
  runId: string
}): Promise<DeletionSummary>
