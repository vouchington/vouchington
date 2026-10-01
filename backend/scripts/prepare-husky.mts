async function loadHusky() {
  try {
    return await import('husky')
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      err.code === 'ERR_MODULE_NOT_FOUND' &&
      err.message.includes("package 'husky'")
    ) {
      return null
    }
    throw err
  }
}

const husky = await loadHusky()
if (husky) {
  const message = husky.default()
  if (message) process.stdout.write(`${message}\n`)
} else {
  console.log('prepare: skipping husky (not installed)')
}
