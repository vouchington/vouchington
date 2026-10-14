import { STORYBOOK_PROGRESS_MARKER_PREFIX } from '../test-helpers/vitest-storybook-progress-reporter.mts'
import {
  hasStorybookBrowserViteDependencyReady,
  hasStorybookViteNewDependenciesFound,
  hasStorybookViteOptimizerReload,
  stripAnsi,
} from './transient-retry/storybook-shared.mts'

// Quiet lines are machine-consumed watchdog evidence. They stay out of the job log on success
// and are replayed from this bounded tail when an attempt fails.
export const MAX_QUIET_TAIL_BYTES = 128 * 1024
const viteDepsDebugPattern = /\bvite:deps\b/

export function isQuietStorybookLine(line: string): boolean {
  const plain = stripAnsi(line)
  if (plain.includes(STORYBOOK_PROGRESS_MARKER_PREFIX)) return true
  // Keep the optimizer lifecycle lines that classify retry and optimizeDeps guidance visible.
  return (
    viteDepsDebugPattern.test(plain) &&
    !hasStorybookBrowserViteDependencyReady(plain) &&
    !hasStorybookViteNewDependenciesFound(plain) &&
    !hasStorybookViteOptimizerReload(plain)
  )
}

export class StorybookQuietOutput {
  private tail = Buffer.alloc(0)

  /** Returns the lines that belong in the job log and retains the quiet ones. */
  split(output: string): string {
    let visible = ''
    for (const line of output.split(/(?<=\n)/)) {
      if (isQuietStorybookLine(line)) this.retain(line)
      else visible += line
    }
    return visible
  }

  /** Returns the retained quiet output once, or an empty string when there is none. */
  drain(): string {
    const text = this.tail.toString('utf8')
    this.tail = Buffer.alloc(0)
    return text
  }

  private retain(line: string): void {
    const next = Buffer.concat([this.tail, Buffer.from(line)])
    this.tail =
      next.byteLength <= MAX_QUIET_TAIL_BYTES
        ? next
        : next.subarray(next.byteLength - MAX_QUIET_TAIL_BYTES)
  }
}

export function quietOutputHeader(bytes: number): string {
  return `[storybook-browser] attempt did not succeed; replaying suppressed progress markers and vite:deps debug output (last ${bytes} bytes):\n`
}
