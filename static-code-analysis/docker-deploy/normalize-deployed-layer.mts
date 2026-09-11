#!/usr/bin/env node
import { pathToFileURL } from 'node:url'

import {
  EPOCH_PRUNED_AT,
  normalizeDeployedLayer,
  runNormalizeDeployedLayerCli as runPublished,
} from 'vouchington-tooling/pnpm-deploy'

export { EPOCH_PRUNED_AT, normalizeDeployedLayer }

const FILAMENTS_DEPLOY_ENV = { PROD_DIR: '/prod/backend' } as const

export function runNormalizeDeployedLayerCli(options: Parameters<typeof runPublished>[0]): void {
  runPublished({
    ...options,
    env: { ...FILAMENTS_DEPLOY_ENV, ...options.env },
  })
}

runNormalizeDeployedLayerCli({
  args: process.argv.slice(2),
  env: process.env,
  isMain: Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href),
  stdout: console.log,
})
