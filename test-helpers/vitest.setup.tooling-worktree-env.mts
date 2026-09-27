import { envForDbBackedToolingProject, replaceEnvInPlace } from '../ci/tooling-test-env.mts'

replaceEnvInPlace(envForDbBackedToolingProject(process.cwd()))
