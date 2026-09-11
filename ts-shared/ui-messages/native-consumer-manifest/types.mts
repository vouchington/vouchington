export type NativeConsumer = 'swift' | 'dotnet'

export type NativeConsumerManifestEntry = Readonly<{
  key: string
  consumers: readonly NativeConsumer[]
}>
