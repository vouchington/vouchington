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

const indentedContinuationPattern = /^ {2,}\S/

function isViteDepsDebugLine(plain: string): boolean {
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
  // A vite:deps message lists its dependency paths on indented lines that carry no namespace.
  private inViteDepsBlock = false

  /** Returns the lines that belong in the job log and retains the quiet ones. */
  split(output: string): string {
    let visible = ''
    for (const line of output.split(/(?<=\r?\n|\r(?!\n))/)) {
      if (this.isQuiet(line)) this.retain(line)
      else visible += line
    }
    return visible
  }

  private isQuiet(line: string): boolean {
    const plain = stripAnsi(line)
    if (plain.includes(STORYBOOK_PROGRESS_MARKER_PREFIX)) return true
    if (isViteDepsDebugLine(plain)) {
      this.inViteDepsBlock = true
      return true
    }
    const continuation = this.inViteDepsBlock && indentedContinuationPattern.test(plain)
    this.inViteDepsBlock = continuation
    return continuation
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
