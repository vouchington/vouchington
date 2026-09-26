import { dynamicConfigPrimaryValkeyClient } from '@data-stores/valkey/clients'

export async function unlinkTestAiUsageUncertaintyKey(key: string): Promise<void> {
  await dynamicConfigPrimaryValkeyClient.unlink([key])
}
