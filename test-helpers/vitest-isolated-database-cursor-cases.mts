/** Cursor and checkpoint sweeps run on the shared database. */
export const cursorIsolatedCases = {} as const satisfies Record<
  string,
  { file: string; fullName: `${string} > ${string}` }
>
