const imagePattern = /^pgvector\/pgvector:pg18@sha256:[0-9a-f]{64}$/u

export function isPinnedPostgresImage(image: string): boolean {
  return imagePattern.test(image)
}

export function postgresImageFromWorkflow(workflow: string): string {
  const rootJobs = [...workflow.matchAll(/^jobs:\r?\n((?:(?:[ \t]+[^\r\n]*|[ \t]*)\r?\n)*)/gmu)]
  if ([...workflow.matchAll(/^jobs:/gmu)].length !== 1 || rootJobs.length !== 1) {
    throw new Error('Expected one root jobs block in schema workflow')
  }
  const jobs = [
    ...rootJobs[0]![1]!.matchAll(
      /^ {2}postgres-schema-tests:\r?\n((?:(?: {4,}[^\r\n]*|[ \t]*)\r?\n)*)/gmu,
    ),
  ]
  if (jobs.length !== 1 || !rootJobs[0]![1]!.startsWith(jobs[0]![0]))
    throw new Error('Expected one postgres-schema-tests job in schema workflow')
  const services = [
    ...jobs[0]![1]!.matchAll(/^ {4}services:\r?\n((?:(?: {6,}[^\r\n]*|[ \t]*)\r?\n)*)/gmu),
  ]
  if (services.length !== 1) throw new Error('Expected one services block in PostgreSQL schema job')
  const postgres = [
    ...services[0]![1]!.matchAll(/^ {6}postgres:\r?\n((?:(?: {8,}[^\r\n]*|[ \t]*)\r?\n)*)/gmu),
  ]
  if (postgres.length !== 1)
    throw new Error('Expected one postgres service in PostgreSQL schema job')
  const images = [...postgres[0]![1]!.matchAll(/^ {8}image: ([^\r\n]+)\r?$/gmu)].map(
    match => match[1]!,
  )
  if (images.length !== 1 || !isPinnedPostgresImage(images[0]!)) {
    throw new Error('Expected exactly one digest-pinned PostgreSQL 18 image in schema workflow')
  }
  return images[0]!
}
