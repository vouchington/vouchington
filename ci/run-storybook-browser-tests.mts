#!/usr/bin/env node
import { fileURLToPath } from 'node:url'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runStorybookBrowserTests()
}
