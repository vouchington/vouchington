import PrivateValkeyRunner from './vitest.runner.private-valkey.mts'

export default class PlatformStatsCacheRunner extends PrivateValkeyRunner {
  constructor(config: ConstructorParameters<typeof PrivateValkeyRunner>[0]) {
    super(config, 'platform-stats')
  }
}
