// Shared Sentry initialization for all Lambda functions.
// Each Lambda's entry point first imports a side-effect module that calls initSentry() at module
// load (image-resize: sentry-init.mts). There is no awslambda-auto preload and no wrapHandler:
// esbuild bundles @sentry/aws-serverless, so a NODE_OPTIONS --import of it would not resolve from
// the zip. This module configures the DSN, environment, and filtering.
//
// Enabled only for ENVIRONMENT=staging|production.

import * as Sentry from '@sentry/aws-serverless'
import { createVouchaSentryInitOptions } from '@ts-shared/utils/sentry-init-options'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'

const DEFAULT_TRACES_SAMPLE_RATE = 1.0

export interface InitSentryOptions {
  lambdaName: string
}

export function captureException(error: unknown): void {
  Sentry.captureException(error)
}

export function initSentry({ lambdaName }: InitSentryOptions): void {
  Sentry.init(
    createVouchaSentryInitOptions({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.ENVIRONMENT,
      // Falls back to the shared deploy-environment accessor (ENVIRONMENT ?? NODE_ENV ??
      // 'development') rather than a hand-rolled NODE_ENV-only read.
      fallbackEnvironment: getDeployEnvironment(),
      release: process.env.GIT_COMMIT,
      tracesSampleRate: getTracesSampleRate(),
      initialScope: { tags: { lambda: lambdaName } },
    }),
  )
}

function getTracesSampleRate(): number {
  const value = getNonEmptyEnv('SENTRY_TRACES_SAMPLE_RATE')
  if (!value) return DEFAULT_TRACES_SAMPLE_RATE

  const sampleRate = Number(value)
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    return DEFAULT_TRACES_SAMPLE_RATE
  }

  return sampleRate
}

function getNonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}
