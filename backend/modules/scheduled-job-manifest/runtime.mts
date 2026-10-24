import {
  getDeployEnvironment,
  isProductionEnvironment,
  type DeployEnvironmentSource,
} from '@ts-shared/deploy-environment'
import {
  upsertScheduledJobManifest as upsertSharedManifest,
  type ScheduledJobQueue,
} from '@vouchington/worker-runtime/schedule-manifest'
import { clampScheduledJobRepeatToHourlyFloor } from './hourly-clamp.mts'
import type { ScheduledJobManifest } from './types.mts'

export async function upsertScheduledJobManifest(
  queue: ScheduledJobQueue,
  manifest: ScheduledJobManifest,
  // `env` and `applyHourlyFloor` let tests pin ENVIRONMENT/NODE_ENV per call instead of mutating
  // the ambient process.env, which leaks across parallel Vitest files, and drive the floor
  // directly. The real default -- staging only, via the deploy-environment accessor -- is derived
  // from `env` below.
  options: {
    nodeEnv?: string
    env?: DeployEnvironmentSource
    applyHourlyFloor?: boolean
  } = {},
): Promise<void> {
  // IS_PRODUCTION (not raw NODE_ENV, which ECS also sets to 'production' on staging):
  // options.nodeEnv remains a full override for tests; the real runtime path defers to
  // ENVIRONMENT via isProductionEnvironment() so 'production'-only jobs stay off staging.
  const isProduction =
    options.nodeEnv === undefined
      ? isProductionEnvironment(options.env)
      : options.nodeEnv === 'production'
  const isDeployed =
    options.nodeEnv === undefined
      ? ['production', 'staging'].includes(getDeployEnvironment(options.env))
      : ['production', 'staging'].includes(options.nodeEnv)
  const applyHourlyFloor =
    options.applyHourlyFloor ?? getDeployEnvironment(options.env) === 'staging'
  await upsertSharedManifest(queue, manifest, {
    include: job =>
      (job.environment !== 'production' && job.environment !== 'deployed') ||
      (job.environment === 'production' && isProduction) ||
      (job.environment === 'deployed' && isDeployed),
    // The floor aligns the resolved value, not the definition: a thunk re-resolves to its real
    // interval on every call, and only the interval about to be registered matters. glide-mq keeps
    // a stored next run only when the upserted schedule is identical, so moving an existing
    // scheduler to :00 needs no remove-and-re-add. `environment: 'production'` jobs are never
    // clamped, decoupling that rule from how `applyHourlyFloor` was derived.
    transformRepeat: (repeat, job) =>
      applyHourlyFloor && job.environment !== 'production'
        ? clampScheduledJobRepeatToHourlyFloor(repeat).repeat
        : repeat,
  })
}
