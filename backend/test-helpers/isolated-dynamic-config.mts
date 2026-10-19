import {
  closeScopedDynamicConfigContext,
  createDynamicConfigForTest,
  createDynamicConfigTestKey,
} from './dynamic-config.mts'

type Config = ReturnType<typeof createDynamicConfigForTest>
type Entry = {
  config: Pick<
    Config,
    'key' | 'fieldTypes' | 'defaultFields' | 'waitForInitialization' | 'getFields' | 'setFields'
  >
}

/** Keeps real API persistence on a worker-unique key while restoring the registered instance. */
export async function withIsolatedDynamicConfigForTest<T>(
  entry: Entry,
  run: (config: Config) => Promise<T>,
): Promise<T> {
  const previous = entry.config
  const config = createDynamicConfigForTest({
    key: createDynamicConfigTestKey('admin-api'),
    fieldTypes: previous.fieldTypes,
    defaultFields: previous.defaultFields,
  })
  try {
    await config.waitForInitialization()
    entry.config = config
    return await run(config)
  } finally {
    entry.config = previous
    await closeScopedDynamicConfigContext([config])
  }
}
