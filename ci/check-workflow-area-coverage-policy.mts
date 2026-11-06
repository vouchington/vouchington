import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { trackedFiles } from './tracked-files.mts'
import { areaCoveragePolicyViolations } from './workflow-area-coverage-policy.mts'

/** Read tracked workflow files once in the required static job. */
export function checkWorkflowAreaCoveragePolicy(root: string): string[] {
  const paths = trackedFiles(root, ['.github/workflows'])
    .filter(path => /^\.github\/workflows\/[^/]+\.yml$/.test(path))
    .toSorted()
  const sources = Object.fromEntries(
    paths.map(path => [path, readFileSync(join(root, path), 'utf8')]),
  )
  return areaCoveragePolicyViolations(sources)
}
