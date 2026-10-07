export type ReconciliationPage = { nextCursor: string | null }

export async function processReconciliationPage<TPage extends ReconciliationPage>(
  after: string | undefined,
  readPage: (after?: string) => Promise<TPage>,
  enqueueContinuation: (after: string) => unknown | Promise<unknown>,
): Promise<TPage> {
  const page = await readPage(after)
  if (page.nextCursor !== null) await enqueueContinuation(page.nextCursor)
  return page
}
