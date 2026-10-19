import { createHash, createHmac } from 'node:crypto'
import { copyFile, mkdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

type UploadResult = {
  publicUrl: string
  cdnUrl: string | null
  localUrl: string | null
  storageMode: 'r2' | 'local'
}

function getPublicRoot() {
  return path.resolve(process.cwd(), 'public', 'generated-clips')
}

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string | null
}

export const R2_REQUIRED_ENV_NAMES = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
] as const

export const R2_OPTIONAL_ENV_NAMES = [] as const

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production'
}

function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() || null

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
  }
}

export function hasR2StorageConfig() {
  return Boolean(getR2Config())
}

export function getR2StorageConfigStatus() {
  const presentEnvNames = R2_REQUIRED_ENV_NAMES.filter((name) => Boolean(process.env[name]?.trim()))
  const missingEnvNames = R2_REQUIRED_ENV_NAMES.filter((name) => !process.env[name]?.trim())

  return {
    backend: 'r2' as const,
    durableStorageConfigured: missingEnvNames.length === 0,
    presentEnvNames,
    missingEnvNames,
    optionalEnvNames: [...R2_OPTIONAL_ENV_NAMES],
  }
}

export function getRequiredR2Config(): R2Config {
  const config = getR2Config()

  if (!config) {
    throw new Error(
      'Missing R2 configuration. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL.',
    )
  }

  return config
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest()
}

function encodeRfc3986Segment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function buildObjectKey(storagePath: string) {
  return storagePath.replace(/^\/+/, '')
}

function buildCanonicalPath(bucket: string, objectKey: string) {
  const encodedKey = objectKey
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeRfc3986Segment(segment))
    .join('/')

  return `/${encodeRfc3986Segment(bucket)}/${encodedKey}`
}

function buildPublicUrl(config: R2Config, objectKey: string) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/, '')}/${objectKey}`
  }

  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${objectKey}`
}

export function getR2PublicUrl(objectKey: string) {
  return buildPublicUrl(getRequiredR2Config(), buildObjectKey(objectKey))
}

export async function createGeneratedClipUploadTarget(
  storagePath: string,
  options: { expiresInSeconds?: number } = {},
) {
  const config = getRequiredR2Config()
  const objectKey = buildObjectKey(storagePath)
  const expiresInSeconds = options.expiresInSeconds ?? 900

  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 900) {
    throw new Error('R2 upload URL expiry must be between 60 and 900 seconds.')
  }
  if (!objectKey || objectKey.split('/').some((segment) => segment === '..')) {
    throw new Error('R2 upload object key is invalid.')
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
  let uploadUrl: string
  try {
    uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ContentType: 'video/mp4',
      }),
      { expiresIn: expiresInSeconds },
    )
  } finally {
    client.destroy()
  }

  return {
    uploadUrl,
    publicUrl: buildPublicUrl(config, objectKey),
  }
}

async function performSignedR2Request(input: {
  method: 'PUT' | 'DELETE'
  objectKey: string
  payload?: Buffer
  config: R2Config
}) {
  const payload = input.payload ?? Buffer.alloc(0)
  const payloadHash = sha256(payload)
  const host = `${input.config.accountId}.r2.cloudflarestorage.com`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const canonicalUri = buildCanonicalPath(input.config.bucket, input.objectKey)
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [
    input.method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.config.secretAccessKey}`, dateStamp), 'auto'), 's3'),
    'aws4_request',
  )
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  let body: ArrayBuffer | undefined
  if (input.method === 'PUT') {
    body = new ArrayBuffer(payload.byteLength)
    new Uint8Array(body).set(payload)
  }

  return fetch(`https://${host}${canonicalUri}`, {
    method: input.method,
    headers: {
      authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body,
  })
}

async function uploadToR2(
  localPath: string,
  storagePath: string,
  config: R2Config,
  input: { deleteSource: boolean },
): Promise<UploadResult> {
  const objectKey = buildObjectKey(storagePath)
  const payload = await readFile(localPath)
  const response = await performSignedR2Request({
    method: 'PUT',
    objectKey,
    payload,
    config,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `R2 upload failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`,
    )
  }

  if (input.deleteSource) {
    await unlink(localPath).catch(() => {})
  }

  const publicUrl = buildPublicUrl(config, objectKey)

  return {
    publicUrl,
    cdnUrl: publicUrl,
    localUrl: null,
    storageMode: 'r2',
  }
}

async function uploadToLocalPublicDir(
  localPath: string,
  storagePath: string,
  input: { deleteSource: boolean },
): Promise<UploadResult> {
  const objectKey = buildObjectKey(storagePath)
  const targetPath = path.join(getPublicRoot(), objectKey)

  await mkdir(path.dirname(targetPath), { recursive: true })
  await copyFile(localPath, targetPath)
  if (input.deleteSource) {
    await unlink(localPath).catch(() => {})
  }

  const publicUrl = `/generated-clips/${objectKey}`

  return {
    publicUrl,
    cdnUrl: null,
    localUrl: publicUrl,
    storageMode: 'local',
  }
}

export async function uploadGeneratedClip(localPath: string, storagePath: string): Promise<UploadResult> {
  return storeGeneratedClip(localPath, storagePath, { deleteSource: true })
}

export async function copyGeneratedClipToStorage(localPath: string, storagePath: string): Promise<UploadResult> {
  return storeGeneratedClip(localPath, storagePath, { deleteSource: false })
}

async function storeGeneratedClip(
  localPath: string,
  storagePath: string,
  input: { deleteSource: boolean },
): Promise<UploadResult> {
  const r2Config = getR2Config()

  if (r2Config) {
    return uploadToR2(localPath, storagePath, r2Config, input)
  }

  if (isProductionRuntime()) {
    throw new Error(
      'R2 storage is required in production. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL.',
    )
  }

  return uploadToLocalPublicDir(localPath, storagePath, input)
}

export async function deleteR2Object(objectKey: string) {
  const config = getRequiredR2Config()
  const normalizedKey = buildObjectKey(objectKey)
  const response = await performSignedR2Request({
    method: 'DELETE',
    objectKey: normalizedKey,
    config,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `R2 delete failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`,
    )
  }
}
