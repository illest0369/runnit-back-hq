export async function postToTikTok(input: {
  postId: string
  videoUrl: string
  caption: string
}): Promise<{ platformPostId: string }> {
  if (!input.videoUrl) {
    throw new Error('TIKTOK_VIDEO_REQUIRED')
  }

  throw new Error('TIKTOK_DIRECT_POSTING_DISABLED_USE_MANUAL_HANDOFF')
}
