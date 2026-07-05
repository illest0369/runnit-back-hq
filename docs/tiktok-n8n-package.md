# TikTok n8n Draft Package

RBHQ sends TikTok draft packages to local self-hosted n8n only after manual approval. The package is a dry-run handoff while `N8N_TEST_MODE=true`; `automation_queued` means n8n received the draft and does not mean the clip was posted.

Required package fields:

```json
{
  "targetPlatform": "tiktok",
  "publishAction": "dry_run",
  "testMode": true,
  "clipId": "approved-rendered-clip-id",
  "title": "Draft title",
  "hook": "Draft hook",
  "caption": "TikTok caption",
  "hashtags": ["#RBHQ", "#TikTokSports"],
  "mediaPath": "/local/path/to/rendered.mp4",
  "mediaUrl": null,
  "durationSeconds": 15,
  "width": 1080,
  "height": 1920,
  "sizeBytes": 3604744,
  "mimeType": "video/mp4",
  "format": "mp4",
  "sourceVideoUrl": "/local/path/or/source/url.mp4",
  "startSeconds": 0,
  "endSeconds": 15
}
```

n8n can use `mediaPath` on the Mac mini for local files or `mediaUrl` when RBHQ later provides hosted media. TikTok credentials and upload/publish steps belong in n8n in a later phase, not in RBHQ.

Verification:

```bash
npm run smoke:tiktok-n8n-package
```
