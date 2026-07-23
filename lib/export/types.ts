export type PublishExportPackage = {
  clip_id: string
  channel_id?: string | null
  title: string
  hook: string
  recommended_hook: string | null
  caption: string
  description?: string | null
  hashtags: string[]
  source_name: string
  source_url?: string | null
  source_title?: string | null
  sport: string | null
  league: string | null
  video_url: string
  rendered_mp4_url?: string
  asset_reference?: string | null
  thumbnail_url: string | null
  selected_clip?: {
    start_seconds: number | null
    end_seconds: number | null
  }
  target_platforms?: string[]
  platform_copy?: Record<string, {
    title: string
    caption: string
    description: string
    hashtags: string[]
    video_url: string
  }>
  operator_notes?: string[]
  moderation_notes: string[]
  approved_at: string
  export_version: string
}

export type ExportableClip = {
  id: string
  channel_id?: string | null
  title: string
  hook: string
  recommended_hook: string | null
  source_name: string
  sport: string | null
  league: string | null
  video_url: string | null
  source_url?: string | null
  thumbnail_url: string | null
  moderation_notes: string[]
  approved_at: string | null
  manually_published_at?: string | null
  updated_at: string
  status: string
  publish_status: string
}
