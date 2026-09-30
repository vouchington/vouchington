#!/usr/bin/env node
import {
  pruneDeployedRuntimeDeps,
  runPruneDeployedRuntimeDepsCli as runPublished,
} from 'vouchington-tooling/pnpm-deploy'

export { pruneDeployedRuntimeDeps }

const VOUCHINGTON_DEPLOY_ENV = { PROD_DIR: '/prod/backend' } as const

export function runPruneDeployedRuntimeDepsCli(options: Parameters<typeof runPublished>[0]): void {
  runPublished({
    ...options,
    env: { ...VOUCHINGTON_DEPLOY_ENV, ...options.env },
  })
}

runPruneDeployedRuntimeDepsCli({
  args: process.argv.slice(2),
  env: process.env,
  isMain: import.meta.main,
  stdout: console.log,
})
