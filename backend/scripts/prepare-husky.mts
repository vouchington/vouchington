async function loadHusky() {
  try {
    return await import('husky')
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ERR_MODULE_NOT_FOUND' &&
      error.message.includes("package 'husky'")
    ) {
      return null
    }
    throw error
  }
}

const husky = await loadHusky()
if (husky) {
  const message = husky.default()
  if (message) process.stdout.write(`${message}\n`)
} else {
  console.log('prepare: skipping husky (not installed)')
}
