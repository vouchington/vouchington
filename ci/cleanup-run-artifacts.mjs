import artifactPatterns from './cleanup-artifacts-patterns.json' with { type: 'json' }
import { createArtifactPatternMatcher } from './cleanup-artifacts-pattern-matcher.mjs'

const isKeep = createArtifactPatternMatcher(artifactPatterns.keep)
const isDelete = createArtifactPatternMatcher(artifactPatterns.delete)

function shouldDelete(artifact) {
  return !artifact.expired && !isKeep(artifact.name) && isDelete(artifact.name)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

const defaultLog = {
  info: message => console.info(message),
  warning: message => console.warn(message),
}

export async function cleanupRunArtifacts({ github, repo, runId, log = defaultLog }) {
  const numericRunId = Number(runId)
  if (!Number.isSafeInteger(numericRunId) || numericRunId <= 0) {
    throw new Error('runId must be a positive integer')
  }

  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
    ...repo,
    run_id: numericRunId,
    per_page: 100,
  })

  let bytesFreed = 0
  let deletedCount = 0

  for (const artifact of artifacts.filter(shouldDelete)) {
    try {
      await github.rest.actions.deleteArtifact({ ...repo, artifact_id: artifact.id })
      bytesFreed += artifact.size_in_bytes
      deletedCount += 1
    } catch (error) {
      if (error?.status !== 404) {
        log.warning(
          `[cleanup-artifacts] failed to delete ${artifact.name} (id ${artifact.id}): ${errorMessage(error)}`,
        )
      }
    }
  }

  const megabytesFreed = (bytesFreed / (1024 * 1024)).toFixed(1)
  log.info(
    `[cleanup-artifacts] run: deleted ${deletedCount} artifact(s), freed ~${megabytesFreed} MB`,
  )
  return { deletedCount, bytesFreed }
}
