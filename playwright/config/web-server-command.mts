import type { ReporterDescription } from '@playwright/test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withNodeOption } from './config-helpers.mts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const otelRegisterPreload = join(repoRoot, 'dev', 'otel-register.mts')

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
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

function withOtelNodeImport(command: string, otelEnabled: boolean): string {
  if (!otelEnabled) return command
  return command.replace(/(^|\s)node(?=\s)/, `$1node --import ${shellQuote(otelRegisterPreload)}`)
}

export function withOtelNodeOptions(nodeOptions: string, otelEnabled: boolean): string {
  if (!otelEnabled) return nodeOptions
  return withNodeOption(nodeOptions, `--import "${otelRegisterPreload}"`)
}

export function nodeServerCommand({
  name,
  serviceName,
  command,
  logDir,
  otelEnabled,
}: {
  name: string
  serviceName: string
  command: string
  logDir: string
  otelEnabled: boolean
}): string {
  const logPath = join(logDir, `${name}.log`)
  const envPrefix = [
    `OTEL_SERVICE_NAME=${serviceName}`,
    ...(otelEnabled ? ['OTEL_LOGS_EXPORTER=otlp'] : []),
  ].join(' ')
  const instrumentedCommand = `${envPrefix} ${withOtelNodeImport(command, otelEnabled)}`
  return `bash -lc ${shellQuote(`set -o pipefail; mkdir -p ${shellQuote(logDir)}; ${instrumentedCommand} 2>&1 | tee ${shellQuote(logPath)}`)}`
}
