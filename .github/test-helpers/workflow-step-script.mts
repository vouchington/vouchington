import { readFileSync } from 'node:fs'

/** Read the checked-in body while keeping tests tied to the workflow's source invocation. */
export function workflowStepScript(run: string | undefined): string {
  if (!run) throw new Error('Missing workflow run script')
  const source = /^source "\$GITHUB_WORKSPACE\/(\.github\/workflows\/[^"\n]+\.sh)"\s*$/.exec(run)
  return source?.[1] ? readFileSync(source[1], 'utf8') : run
}
