'use client'

import { CSRF_HEADER } from './csrf-constants'

let currentToken: string | null = null

export async function getCsrfToken(): Promise<string> {
  if (currentToken) {
    return currentToken
  }

  const response = await fetch('/api/csrf', {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Unable to initialize CSRF.')
  }

  const data = (await response.json()) as { csrfToken?: string }
  if (!data.csrfToken) {
    throw new Error('Missing CSRF token.')
  }

  currentToken = data.csrfToken
  return currentToken
}

export async function getCsrfHeaders(): Promise<Record<string, string>> {
  return {
    [CSRF_HEADER]: await getCsrfToken(),
  }
}

export function updateCsrfToken(token: string | undefined) {
  if (token) {
    currentToken = token
  }
}
