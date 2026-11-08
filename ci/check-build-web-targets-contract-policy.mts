import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildWebTargetsContractViolations } from './build-web-targets-contract-policy.mts'
import { trackedFiles } from './tracked-files.mts'

export function checkBuildWebTargetsContractPolicy(root: string): string[] {
  const paths = trackedFiles(root, [
    '.github/workflows',
    '.github/actions/build-web-targets/action.yml',
    'ci/build-infra/validate-restored-web-targets.sh',
    'ci/build-infra/build-web-targets.sh',
  ]).filter(
    path =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path) ||
      path === '.github/actions/build-web-targets/action.yml' ||
      path === 'ci/build-infra/validate-restored-web-targets.sh' ||
      path === 'ci/build-infra/build-web-targets.sh',
  )
  return buildWebTargetsContractViolations(
    new Map(paths.map(path => [path, readFileSync(join(root, path), 'utf8')])),
  )
}
if (import.meta.main) {
  const violations = checkBuildWebTargetsContractPolicy(process.cwd())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exitCode = 1
  }
}
