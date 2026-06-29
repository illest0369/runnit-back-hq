const DEV_SESSION_SECRET = 'runnit-back-dev-session-secret'

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim()

  if (secret) {
    return secret
  }

  if (isProductionRuntime()) {
    throw new Error('SESSION_SECRET is required in production.')
  }

  return DEV_SESSION_SECRET
}

export function isDangerousDevRoutesAllowed(): boolean {
  return isTruthy(process.env.ALLOW_DANGEROUS_DEV_ROUTES)
}

export function isIngestTestEnabled(): boolean {
  const enabled = isTruthy(process.env.INGEST_TEST_ENABLED)

  if (!enabled) {
    return false
  }

  if (isProductionRuntime() && !isDangerousDevRoutesAllowed()) {
    return false
  }

  return true
}

export function assertProductionSecurityRequirements(): void {
  void getSessionSecret()

  if (
    isProductionRuntime() &&
    isTruthy(process.env.INGEST_TEST_ENABLED) &&
    !isDangerousDevRoutesAllowed()
  ) {
    throw new Error(
      'INGEST_TEST_ENABLED is blocked in production unless ALLOW_DANGEROUS_DEV_ROUTES=true.',
    )
  }
}
