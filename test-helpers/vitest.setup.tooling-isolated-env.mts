import { envWithoutWorktreeResources } from '../ci/coverage-suite-env.mts'

process.env = envWithoutWorktreeResources()
