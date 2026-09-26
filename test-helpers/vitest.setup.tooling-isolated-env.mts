import { envWithoutWorktreeResources, replaceEnvInPlace } from '../ci/tooling-test-env.mts'

replaceEnvInPlace(envWithoutWorktreeResources())
