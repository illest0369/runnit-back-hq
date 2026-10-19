import assert from 'node:assert/strict'
import test from 'node:test'

import { createGeneratedClipUploadTarget } from '../lib/clip-storage'

test('R2 upload target is short-lived, channel-scoped, and does not expose the secret', async () => {
  const previous = {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  }

  try {
    process.env.R2_ACCOUNT_ID = 'account-id'
    process.env.R2_ACCESS_KEY_ID = 'access-key'
    process.env.R2_SECRET_ACCESS_KEY = 'do-not-expose-this-secret'
    process.env.R2_BUCKET = 'rbhq-phase1-staging-generated-clips'
    process.env.R2_PUBLIC_BASE_URL = 'https://media.staging.example/'

    const target = await createGeneratedClipUploadTarget(
      '/channels/channel-1/generated-clips/clip.mp4',
      { expiresInSeconds: 120 },
    )
    const uploadUrl = new URL(target.uploadUrl)

    assert.equal(uploadUrl.protocol, 'https:')
    assert.equal(uploadUrl.hostname, 'account-id.r2.cloudflarestorage.com')
    assert.equal(
      uploadUrl.pathname,
      '/rbhq-phase1-staging-generated-clips/channels/channel-1/generated-clips/clip.mp4',
    )
    assert.equal(uploadUrl.searchParams.get('X-Amz-Expires'), '120')
    assert.match(uploadUrl.searchParams.get('X-Amz-Signature') ?? '', /^[a-f0-9]{64}$/)
    assert.doesNotMatch(target.uploadUrl, /do-not-expose-this-secret/)
    assert.equal(
      target.publicUrl,
      'https://media.staging.example/channels/channel-1/generated-clips/clip.mp4',
    )
  } finally {
    process.env.R2_ACCOUNT_ID = previous.accountId
    process.env.R2_ACCESS_KEY_ID = previous.accessKeyId
    process.env.R2_SECRET_ACCESS_KEY = previous.secretAccessKey
    process.env.R2_BUCKET = previous.bucket
    process.env.R2_PUBLIC_BASE_URL = previous.publicBaseUrl
  }
})
