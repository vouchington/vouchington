#!/usr/bin/env node

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'

if (import.meta.main) {
  process.exitCode = await runStorybookBrowserTests()
}
