export function extractYouTubeId(url: string): string | null {
  const match =
    url.match(/[?&]v=([^&]+)/) ||
    url.match(/youtu\.be\/([^?]+)/) ||
    url.match(/youtube\.com\/embed\/([^?]+)/)

  return match ? decodeURIComponent(match[1]) : null
}

export function buildYouTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }

  const videoId = extractYouTubeId(url)
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null
}
