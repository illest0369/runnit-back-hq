const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const binary = atob(`${normalized}${padding}`)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return decoder.decode(bytes)
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))

  return toBase64Url(new Uint8Array(signature))
}

export async function signSessionPayload(payload: string, secret: string): Promise<string> {
  const encodedPayload = toBase64Url(payload)
  const signature = await signValue(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export async function verifySignedSession<T>(value: string, secret: string): Promise<T | null> {
  const [encodedPayload, providedSignature] = value.split('.')

  if (!encodedPayload || !providedSignature) {
    return null
  }

  const expectedSignature = await signValue(encodedPayload, secret)
  if (providedSignature !== expectedSignature) {
    return null
  }

  try {
    return JSON.parse(fromBase64Url(encodedPayload)) as T
  } catch {
    return null
  }
}
