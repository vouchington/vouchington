import type { Child } from './storybook-browser-runner-test-types.mts'

export function emitProjectAnnotationsFetchFailure(child: Child) {
  child.stderr.emit(
    'data',
    'Failed to fetch dynamically imported module: http://localhost:47711/@id/__x00__virtual:/@storybook/builder-vite/project-annotations.js',
  )
}

export function emitStorybookAddonVitestSetupRunnerMissing(child: Child) {
  child.stderr.emit(
    'data',
    'Error: Failed to import test file /repo/node_modules/.pnpm/@storybook+addon-vitest@10.4.6/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file.js\n' +
      'Caused by: Error: Vitest failed to find the runner. One of the following is possible:\n' +
      '- "vitest" is imported directly without running "vitest" command\n' +
      'Test Files 149 failed\n' +
      'Tests no tests',
  )
}

export function emitStorybookAddonVitestSetupRunnerMissingAnsi(child: Child) {
  child.stderr.emit(
    'data',
    '\u001B[31mError:\u001B[0m Failed to import test file /repo/node_modules/.pnpm/@storybook+addon-vitest@10.4.6_1abc/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file.js\n' +
      '\u001B[31mCaused by:\u001B[0m Error: Vitest failed to find the runner. One of the following is possible:\n' +
      '\u001B[36m- "vitest" is imported directly without running "vitest" command\u001B[0m\n' +
      '\u001B[33mTest Files 149 failed (149)\u001B[0m\n' +
      '\u001B[33mTests no tests\u001B[0m',
  )
}

// The realistic path makes one error block exceed the runner's 1000-char rolling window,
// reproducing the prior nondeterministic two-marker detection failure.
const oversizedAddonVitestSetupFilePath =
  '/repo/node_modules/.pnpm/@storybook+addon-vitest@10.4.6_@vitest+browser-playwright@4.1.9_@vitest+browser@4.1.9_@_41fba38e44b442f509d162a1c9342b2a/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file.js'

export function storybookAddonVitestSetupRunnerMissingOversizedBlock(): string {
  const p = oversizedAddonVitestSetupFilePath
  return (
    `Error: Failed to import test file ${p}\n` +
    'Caused by: Error: Vitest failed to find the runner. One of the following is possible:\n' +
    '- "vitest" is imported directly without running "vitest" command\n' +
    '- "vitest" is imported inside "globalSetup" (to fix this, use "setupFiles" instead, because "globalSetup" runs in a different context)\n' +
    '- "vitest" is imported inside Vite / Vitest config file\n' +
    '- Otherwise, it might be a Vitest bug. Please report it to https://github.com/vitest-dev/vitest/issues\n' +
    '\n' +
    ` ❯ ${p}:20:0\n` +
    ' ❯ ../node_modules/.pnpm/@vitest+runner@4.1.9/node_modules/@vitest/runner/dist/index.js:1120:20\n' +
    ' ❯ ../node_modules/.pnpm/@vitest+browser@4.1.9/node_modules/@vitest/browser/dist/client/tester/runner.js:210:14\n' +
    '\n' +
    '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/160]⎯\n' +
    'Test Files 160 failed (160)\n' +
    'Tests no tests'
  )
}

export function emitStorybookAddonVitestSetupRunnerMissingOversized(child: Child) {
  child.stderr.emit('data', storybookAddonVitestSetupRunnerMissingOversizedBlock())
}
