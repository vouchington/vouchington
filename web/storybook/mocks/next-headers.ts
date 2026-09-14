export async function cookies() {
  return {
    get: () => undefined,
    getAll: () => [],
  }
}

export async function headers() {
  return {
    get: () => null,
  }
}
