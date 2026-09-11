import type { ReporterDescription } from '@playwright/test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const allocatorPath = join(repoRoot, 'ci', 'allocate-browser-safe-ports.py')

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function withHeldPortRelease(port: string, command: string): string {
  const holdDir = process.env.PORT_HOLD_DIR
  if (!holdDir) return command
  const release = `python3 ${shellQuote(allocatorPath)} --release ${shellQuote(port)} --hold-dir ${shellQuote(holdDir)}`
  return `${release} && ${command}`
}

export function definedEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}

export function imageLambdaEnv(source: NodeJS.ProcessEnv, port: string): Record<string, string> {
  return definedEnv({
    ...source,
    IMAGE_LAMBDA_PORT: port,
    S3_BUCKET_IMAGES: source.S3_BUCKET_IMAGES || 'test-images',
    S3_BUCKET_RENDERS: source.S3_BUCKET_RENDERS || 'test-renders',
  })
}

export function createReporter(junitOutputFile: string, ci: boolean): ReporterDescription[] {
  return ci
    ? [
        ['github'],
        ['junit', { outputFile: process.env.PLAYWRIGHT_JUNIT_OUTPUT_FILE || junitOutputFile }],
      ]
    : [['html', { open: 'never' }]]
}

function withOtelNodeImport(command: string, otelEnabled: boolean, otelPreload?: string): string {
  if (!otelEnabled || !otelPreload) return command
  return command.replace(/(^|\s)node(?=\s)/, `$1node --import ${otelPreload}`)
}

export function nodeServerCommand({
  name,
  serviceName,
  command,
  logDir,
  otelEnabled,
  otelPreload,
}: {
  name: string
  serviceName: string
  command: string
  logDir: string
  otelEnabled: boolean
  otelPreload?: string
}): string {
  const logPath = join(logDir, `${name}.log`)
  const envPrefix = [
    `OTEL_SERVICE_NAME=${serviceName}`,
    ...(otelEnabled ? ['OTEL_LOGS_EXPORTER=otlp'] : []),
  ].join(' ')
  const instrumentedCommand = `${envPrefix} ${withOtelNodeImport(command, otelEnabled, otelPreload)}`
  return `bash -lc ${shellQuote(`set -o pipefail; mkdir -p ${shellQuote(logDir)}; ${instrumentedCommand} 2>&1 | tee ${shellQuote(logPath)}`)}`
}
