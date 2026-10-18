import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { forbiddenReactHookSuppressions } from './react-hooks-suppression-policy.mts'

const sourceRoots = ['web/app', 'web/components', 'web/hooks', 'web/lib'] as const
const sourceExtensions = /\.(?:js|jsx|mjs|mts|ts|tsx)$/

function inspectDirectory(root: string, directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return inspectDirectory(root, path)
    if (!sourceExtensions.test(entry.name)) return []
    return forbiddenReactHookSuppressions(readFileSync(join(root, path), 'utf8')).map(
      suppression => `${path}: ${suppression}`,
    )
  })
}

/** Current-source policy check for the dedicated static CI job. */
export function checkReactHookSuppressions(root: string): string[] {
  return sourceRoots.flatMap(directory => inspectDirectory(root, directory))
}

if (import.meta.main) {
  const violations = checkReactHookSuppressions(process.cwd())
  for (const violation of violations) console.error(violation)
  if (violations.length > 0) process.exitCode = 1
}
