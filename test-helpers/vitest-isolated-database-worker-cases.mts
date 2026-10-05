/** Global worker sweeps must not consume or count another suite's fixtures. */
export const workerSweepIsolatedCases = {
  'images-abandoned-upload-cleanup': {
    file: 'backend/workers/images/workers/images.real-glide.mock.test.mts',
    fullName: 'images worker > cleans abandoned uploads from the worker job',
  },
} as const
