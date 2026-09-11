import { registerImageExistsGuard } from '@services/topics/image-exists-guard-registry'
import { assertImageExists } from './validate.mts'

// Registers this package's image-existence check as topics' image-field guard, as a side effect of
// importing this module (see backend/services/images/index.mts, which imports this first for its
// side effects). Keeps topics from depending on images.
registerImageExistsGuard(assertImageExists)
