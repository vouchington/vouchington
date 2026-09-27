#!/usr/bin/env node

import { fileURLToPath } from 'node:url'

import {
  resolveImagePromotion,
  type ImagePromotionOptions,
  type ImagePromotionRequest,
  type ImagePromotionResult,
} from './image-promotion.mts'

const USAGE = 'Usage: node ci/image-promotion-cli.mts plan|verify backend|web'

type ImagePromotionEnvironment = {
  GHCR_PASSWORD?: string
  GHCR_USERNAME?: string
  MAIN_REACHABLE_SOURCE_SHA?: string
}

function required(environment: ImagePromotionEnvironment, name: keyof ImagePromotionEnvironment) {
  const value = environment[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export async function runImagePromotionCli(
  argv: readonly string[],
  environment: ImagePromotionEnvironment,
  write: (value: string) => void,
  options: ImagePromotionOptions = {},
): Promise<ImagePromotionResult> {
  const [phase, group] = argv
  if (
    argv.length !== 2 ||
    (phase !== 'plan' && phase !== 'verify') ||
    (group !== 'backend' && group !== 'web')
  )
    throw new Error(USAGE)
  const request: ImagePromotionRequest = {
    credentials: {
      password: required(environment, 'GHCR_PASSWORD'),
      username: required(environment, 'GHCR_USERNAME'),
    },
    group,
    mainReachableSourceSha: required(environment, 'MAIN_REACHABLE_SOURCE_SHA'),
    phase,
  }
  const result = await resolveImagePromotion(request, options)
  write(`${JSON.stringify(result)}\n`)
  return result
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runImagePromotionCli(process.argv.slice(2), process.env, value =>
      process.stdout.write(value),
    )
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'image promotion failed'}\n`)
    process.exitCode = 1
  }
}
