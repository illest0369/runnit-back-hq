import { GoogleGenAI } from '@google/genai'

import { requireEnv } from '../rbhq-env'

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview'
const DEFAULT_TIMEOUT_MS = 12_000

export async function generateGeminiJson(input: {
  prompt: string
  responseJsonSchema: Record<string, unknown>
  timeoutMs?: number
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') })
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('GEMINI_TIMEOUT')),
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
  })

  try {
    const response = await Promise.race([
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: input.prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: input.responseJsonSchema,
        },
      }),
      timeout,
    ])

    const text = response.text
    if (!text) {
      throw new Error('GEMINI_EMPTY_RESPONSE')
    }

    return text
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}
