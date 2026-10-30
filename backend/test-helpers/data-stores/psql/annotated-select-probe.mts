import { getCapturedQueries, write } from '@data-stores/psql'

export function writeAnnotatedSelectProbe(): ReturnType<typeof write> {
  return write('/* postSearch */ SELECT 1')
}

/** Statements captured for the annotated probe, without the capture timestamp. */
export function capturedProbeStatements(): { text: string; values: readonly unknown[] }[] {
  return getCapturedQueries().map(({ text, values }) => ({ text, values }))
}
