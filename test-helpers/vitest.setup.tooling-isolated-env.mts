import { envWithoutWorktreeResources, replaceEnvInPlace } from '../ci/coverage-suite-env.mts'

replaceEnvInPlace(envWithoutWorktreeResources())
