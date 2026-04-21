import { jwtVerify, SignJWT } from 'jose'

import type { WebEnv } from './env.js'

const COOKIE = 'loopify_session'

export async function createSessionCookie(
  env: WebEnv,
  userId: string,
): Promise<string> {
  const jwt = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(env.sessionSecret)
  return `${COOKIE}=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
}

export async function readSessionUserId(
  env: WebEnv,
  cookieHeader: string | undefined,
): Promise<string | null> {
  if (!cookieHeader) {
    return null
  }
  const m = cookieHeader.match(new RegExp(`${COOKIE}=([^;]+)`))
  if (!m?.[1]) {
    return null
  }
  try {
    const { payload } = await jwtVerify(m[1], env.sessionSecret)
    const sub = payload.sub
    return typeof sub === 'string' ? sub : null
  } catch {
    return null
  }
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
