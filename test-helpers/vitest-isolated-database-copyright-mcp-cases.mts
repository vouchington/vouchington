/** Copyright MCP reads run on the shared database. */
export const copyrightMcpIsolatedCases = {} as const satisfies Record<
  string,
  { file: string; fullName: `${string} > ${string}` }
>
