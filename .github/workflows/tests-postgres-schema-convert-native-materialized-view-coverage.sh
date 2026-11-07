#!/usr/bin/env bash
pnpm exec coverage-check native-v8-to-lcov --v8-dir "$RUNNER_TEMP/native-mv-v8" --source-root "$GITHUB_WORKSPACE" --output "$RUNNER_TEMP/native-mv-coverage/lcov.info" --include 'backend/{api,data-stores,modules,queues,services,workers}/**/*.mts' --exclude '**/*.test.mts'
