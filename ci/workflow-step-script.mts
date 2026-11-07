import { readFileSync } from 'node:fs'

/** Read the checked-in body while keeping tests tied to the workflow's source invocation. */
export function workflowStepScript(
  run: string | undefined,
  readSource: (path: string) => string = path => readFileSync(path, 'utf8'),
): string {
  if (!run) throw new Error('Missing workflow run script')
  const source = /^source "\$GITHUB_WORKSPACE\/(\.github\/workflows\/[^"\n]+\.sh)"\s*$/.exec(run)
  return source?.[1] ? readSource(source[1]) : run
}
