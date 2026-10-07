import type { GeneratedNativeResource } from './native-resources.mts'

export function assertNativeResourceLayout(
  files: readonly GeneratedNativeResource[],
  repeated: readonly GeneratedNativeResource[],
): void {
  const paths = files.map(file => file.path)
  if (
    new Set(paths).size !== paths.length ||
    paths.join('\n') !== [...paths].toSorted().join('\n')
  ) {
    throw new Error('Native resource output paths must be unique and sorted')
  }
  if (
    files.length !== repeated.length ||
    files.some(
      (file, i) => file.path !== repeated[i]?.path || file.content !== repeated[i]?.content,
    )
  ) {
    throw new Error('Native resource output must be deterministic')
  }
  for (const suffix of [
    '/en.lproj/Localizable.strings',
    '/UiMessages.resx',
    '/UiMessageKey.swift',
    '/UiMessageKey.g.cs',
  ]) {
    requiredResource(files, suffix)
  }
}

export function assertNativeModerationResources(files: readonly GeneratedNativeResource[]): void {
  for (const suffix of ['/en.lproj/Localizable.strings', '/UiMessages.resx']) {
    const { content, path } = requiredResource(files, suffix)
    for (const key of [
      'native.moderation.summary.title',
      'native.moderation.summary.disposition.pass',
      'native.moderation.summary.disposition.review',
      'native.moderation.summary.disposition.reject',
      'native.moderation.summary.disposition.incomplete',
      'native.moderation.summary.disposition.none',
      'native.moderation.summary.evidence.flaggedCategories.__plural.other',
      'native.moderation.summary.evidence.signals.__plural.other',
    ]) {
      if (!content.includes(key))
        throw new Error(`Missing native moderation resource "${key}" in ${path}`)
    }
    for (const key of [
      'native.swift.moderationReports.reviewQueueSpam',
      'native.swift.moderationReports.reviewQueueFlaggedScore',
    ]) {
      if (content.includes(key))
        throw new Error(`Retired native moderation resource "${key}" in ${path}`)
    }
  }
}

export function assertNoRetiredDotnetResources(files: readonly GeneratedNativeResource[]): void {
  const { content, path } = requiredResource(files, '/UiMessages.resx')
  for (const key of [
    'native.dotnet.engineering.agentConversationTitle',
    'native.dotnet.engineering.agentConversationsTitle',
    'native.swift.routeSurface.agentType',
    'native.swift.routeSurface.agentUser',
    'native.swift.routeSurface.created',
  ]) {
    if (content.includes(`name="${key}"`))
      throw new Error(`Retired .NET resource "${key}" in ${path}`)
  }
}

function requiredResource(
  files: readonly GeneratedNativeResource[],
  suffix: string,
): GeneratedNativeResource {
  const file = files.find(candidate => candidate.path.endsWith(suffix))
  if (file === undefined) throw new Error(`Missing native resource output ${suffix}`)
  return file
}
