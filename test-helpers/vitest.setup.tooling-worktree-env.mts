import { envForDbBackedToolingProject } from '../ci/coverage-suite-env.mts'

process.env = envForDbBackedToolingProject(process.cwd())
