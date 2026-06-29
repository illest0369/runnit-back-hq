function safeUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function isDownloadableMp4Url(value: string | null | undefined): value is string {
  if (!value) return false
  if (value.startsWith('/')) {
    return value.toLowerCase().endsWith('.mp4')
  }

  const url = safeUrl(value)
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return false
  if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) return false
  return url.pathname.toLowerCase().endsWith('.mp4')
}
