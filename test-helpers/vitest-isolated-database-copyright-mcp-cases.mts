/** Global admin MCP queue reads require a fresh database, including the parent test harness. */
export const copyrightMcpIsolatedCases = {
  'copyright-mcp-read-tools': {
    file: 'backend/tools/admin/copyright-reads.test.mts',
    fullName:
      'copyright admin MCP reads against live services > omits raw email fields, lists bounded pages, and reads a staff case without guest tokens',
  },
} as const satisfies Record<string, { file: string; fullName: `${string} > ${string}` }>
