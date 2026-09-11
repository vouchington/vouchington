#!/usr/bin/env node
import { pathToFileURL } from 'node:url'

import {
  restoreDeployedWorkspacePackages,
  runRestoreDeployedWorkspacePackagesCli as runPublished,
} from 'vouchington-tooling/pnpm-deploy'

export { restoreDeployedWorkspacePackages }

const FILAMENTS_DEPLOY_ENV = {
  PROD_DIR: '/prod/backend',
  BACKEND_DIR: '/app/backend',
} as const

export function runRestoreDeployedWorkspacePackagesCli(
  options: Parameters<typeof runPublished>[0],
): void {
  runPublished({
    ...options,
    env: { ...FILAMENTS_DEPLOY_ENV, ...options.env },
  })
}

runRestoreDeployedWorkspacePackagesCli({
  args: process.argv.slice(2),
  env: process.env,
  isMain: Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href),
})
