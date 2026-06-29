import { getSessionSecret } from './security'
import { verifySignedSession } from './session'

export const SESSION_COOKIE = 'rb_session'

export interface SessionUser {
  userId: string
  username: string
  role: 'admin' | 'operator' | 'user'
  channelIds: string[]
}

export async function readSessionCookie(raw: string | undefined): Promise<SessionUser | null> {
  if (!raw) {
    return null
  }

  return verifySignedSession<SessionUser>(raw, getSessionSecret())
}
