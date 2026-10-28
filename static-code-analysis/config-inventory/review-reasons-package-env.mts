// Variables that only a published package reads at run time; the repository references them only
// to control that package from tests.
export const PACKAGE_ENV_REVIEW_REASONS = new Map<string, string>([
  [
    'NODE_PREWARM_PORT',
    'Readiness port the published worker runtime binds during an image prewarm; backend images no longer prewarm, so only the worker serve-import test helper keeps it unset (#4247).',
  ],
])
