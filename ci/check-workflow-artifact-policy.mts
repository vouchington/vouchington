import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { trackedFiles } from './tracked-files.mts'
import { artifactUploadOutcomeViolations } from './workflow-artifact-outcome-policy.mts'
import { artifactPolicyViolations, type WorkflowSource } from './workflow-artifact-policy.mts'

function artifactSources(root: string): WorkflowSource[] {
  return trackedFiles(root, ['.github/workflows', '.github/actions']).flatMap(path =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path) ||
    /^\.github\/actions\/[^/]+\/action\.ya?ml$/.test(path)
      ? [{ path, source: readFileSync(join(root, path), 'utf8') }]
      : [],
  )
}

/** Run committed workflow artifact policy once in the required static gate. */
export function checkWorkflowArtifactPolicy(root: string): void {
  const files = artifactSources(root)
  const violations = [...artifactPolicyViolations(files), ...artifactUploadOutcomeViolations(files)]
  if (violations.length > 0) throw new Error(violations.join('\n'))
}

if (import.meta.main) checkWorkflowArtifactPolicy(process.argv[2] ?? process.cwd())
