/** Opt-in `--diagnostics` reporting for route-selector-map.mts. Stderr-only: never touches stdout
 * or either generated artifact, so `--check` byte-identity is unaffected whether or not it's on. */

export type I18nDiagnosticsCollector = {
  phase(label: string, durationMs: number): void
  /** Call once per route (and per global-chrome file) whose closure was computed. */
  closureComputed(): void
}

export type I18nDiagnosticsSummary = {
  phases: Record<string, number>
  /** Count of route/global-chrome-file closures computed; not the closures themselves, which can
   * reach megabytes and would otherwise flood CI logs (see `i18n-extract-summary` below). */
  closureCount: number
}

export function createDiagnosticsCollector(): {
  collector: I18nDiagnosticsCollector
  summary: () => I18nDiagnosticsSummary
} {
  const phases: Record<string, number> = {}
  let closureCount = 0
  return {
    collector: {
      phase(label, durationMs) {
        phases[label] = durationMs
      },
      closureComputed() {
        closureCount += 1
      },
    },
    summary: () => ({ phases: { ...phases }, closureCount }),
  }
}

export function formatDiagnosticsLines(summary: I18nDiagnosticsSummary): string[] {
  const lines: string[] = []
  for (const [label, ms] of Object.entries(summary.phases))
    lines.push(`i18n-extract: phase ${label} took ${ms.toFixed(1)}ms`)
  lines.push(`i18n-extract: computed closures for ${summary.closureCount} route/chrome entries`)
  lines.push(`i18n-extract-summary: ${JSON.stringify(summary)}`)
  return lines
}

export function writeDiagnostics(
  summary: I18nDiagnosticsSummary,
  stream: { write(chunk: string): unknown } = process.stderr,
): void {
  for (const line of formatDiagnosticsLines(summary)) stream.write(`${line}\n`)
}
