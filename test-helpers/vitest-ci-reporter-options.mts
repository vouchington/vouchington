import {
  VitestNoSkipsReporter,
  createVitestTeardownOverrunReporter,
} from 'vouchington-tooling/vitest-diagnostics'

export const vitestCiReporterOptions = {
  fileProgressPrefix: '[backend-unit-file]',
  storybookProgressPrefix: '[storybook-browser-progress]',
  extraReporters: [new VitestNoSkipsReporter(), createVitestTeardownOverrunReporter()],
}
