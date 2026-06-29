export type PublishExportPackage = {
  clip_id: string
  title: string
  hook: string
  recommended_hook: string | null
  caption: string
  hashtags: string[]
  source_name: string
  sport: string | null
  league: string | null
  video_url: string
  thumbnail_url: string | null
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
  thumbnail_url: string | null
  moderation_notes: string[]
  approved_at: string | null
  manually_published_at?: string | null
  updated_at: string
  status: string
  publish_status: string
}
