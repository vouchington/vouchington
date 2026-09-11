import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TracedRequest } from './backend-trace-proxy.mts'

export async function writePageArtifact(
  artifactsDir: string,
  name: string,
  data: unknown,
): Promise<void> {
  await mkdir(artifactsDir, { recursive: true })
  await writeFile(
    join(artifactsDir, `${sanitizeFileName(name)}.json`),
    JSON.stringify(data, null, 2),
  )
}

export function printTrace(path: string, tracedRequests: TracedRequest[]): void {
  // Traces are persisted to disk via writePageArtifact; only print to stdout
  // when WEB_INTEGRATION_VERBOSE is set (opt-in for local debugging).
  if (process.env.WEB_INTEGRATION_VERBOSE !== '1') return
  const lines = tracedRequests.length
    ? tracedRequests.map(
        request =>
          `  ${request.method} ${request.path} -> ${request.status} (${request.durationMs}ms)`,
      )
    : ['  (no backend requests)']
  process.stdout.write(`\n[web-integration] API trace for ${path}\n${lines.join('\n')}\n`)
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
