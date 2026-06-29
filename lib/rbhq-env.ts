export function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required.`)
  }

  return value
}
