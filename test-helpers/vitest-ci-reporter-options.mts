import { VitestNoSkipsReporter } from './vitest-no-skips-reporter.mts'
import { createVitestTeardownOverrunReporter } from './vitest-teardown-overrun-reporter.mts'

export const vitestCiReporterOptions = {
  fileProgressPrefix: '[backend-unit-file]',
  storybookProgressPrefix: '[storybook-browser-progress]',
  extraReporters: [new VitestNoSkipsReporter(), createVitestTeardownOverrunReporter()],
}
