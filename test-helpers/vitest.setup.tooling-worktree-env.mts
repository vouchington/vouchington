import { envForDbBackedToolingProject, replaceEnvInPlace } from '../ci/coverage-suite-env.mts'

replaceEnvInPlace(envForDbBackedToolingProject(process.cwd()))
