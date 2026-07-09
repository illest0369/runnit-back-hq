export function requireMacMiniWorkerRequest(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const configuredToken = process.env.MAC_MINI_WORKER_TOKEN?.trim() ?? ''
  if (!configuredToken) {
    return {
      ok: false,
      status: 503,
      error: 'MAC_MINI_WORKER_TOKEN is required before Mac mini worker API access is enabled.',
    }
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length).trim()
    : ''
  const headerToken = request.headers.get('x-rbhq-mac-mini-token')?.trim() ?? ''
  const token = bearer || headerToken

  if (token !== configuredToken) {
    return { ok: false, status: 401, error: 'Unauthorized Mac mini worker request.' }
  }

  return { ok: true }
}
