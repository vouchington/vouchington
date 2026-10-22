import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { checkNoMistakesTestPolicy } from './test-helpers/no-mistakes-test-policy.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/* v8 ignore start -- the static-analysis job runs this real-repository CLI; fixture tests cover the policy core. */
function trackedPaths(root: string): string[] {
  return execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
    .split('\0')
    .filter(path => path.length > 0 && existsSync(`${root}/${path}`))
    .toSorted()
}

if (import.meta.main) {
  const paths = trackedPaths(repoRoot)
  const errors = checkNoMistakesTestPolicy({
    root: repoRoot,
    testPaths: paths.filter(path => /\.(?:mock\.)?test\.[cm]?[jt]sx?$/u.test(path)),
    workflowPaths: paths.filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path)),
  })
  for (const error of errors) console.error(error)
  if (errors.length > 0) process.exitCode = 1
  else console.log('No live no-mistakes workflow drift or Vitest CLI spawns found.')
}
/* v8 ignore stop */
