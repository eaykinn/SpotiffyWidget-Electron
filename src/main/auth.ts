import { createHash, randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { shell } from 'electron'
import { clearTokens, getTokens, setTokens } from './store'

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const REDIRECT_URI = 'http://127.0.0.1:5000/callback/'
/** Refresh a minute before Spotify's expiry */
const EXPIRY_SKEW_MS = 60_000
const SCOPES = [
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'user-top-read',
  'user-library-read',
  'user-library-modify'
].join(' ')

function getClientId(): string {
  const id = process.env.SPOTIFY_CLIENT_ID
  if (!id) {
    throw new Error('SPOTIFY_CLIENT_ID environment variable is required')
  }
  return id
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(64))
}

function generateCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest())
}

function waitForAuthCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', REDIRECT_URI)
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<html><body style="font-family:sans-serif;padding:2rem"><h2>Authorization successful</h2><p>You can close this window.</p></body></html>'
        )

        server.close()

        if (error) {
          reject(new Error(error))
          return
        }
        if (!code) {
          reject(new Error('No auth code received'))
          return
        }
        resolve(code)
      } catch (err) {
        server.close()
        reject(err)
      }
    })

    server.listen(5000, '127.0.0.1')
    server.on('error', reject)
  })
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

function persistTokenResponse(data: TokenResponse): string {
  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600
  setTokens({
    accessToken: data.access_token,
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    expiresAt: Date.now() + expiresInSec * 1000
  })
  return data.access_token
}

function tokenStillValid(): boolean {
  const { accessToken, expiresAt } = getTokens()
  if (!accessToken) return false
  // Legacy tokens without expiresAt: trust for a short grace, then refresh
  if (!expiresAt) return false
  return Date.now() < expiresAt - EXPIRY_SKEW_MS
}

async function exchangeCode(code: string, codeVerifier: string): Promise<void> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: getClientId(),
    code_verifier: codeVerifier
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  const data = (await response.json()) as TokenResponse
  persistTokenResponse({
    ...data,
    refresh_token: data.refresh_token ?? getTokens().refreshToken
  })
}

export async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getTokens()
  if (!refreshToken) return null

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: getClientId()
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as TokenResponse
  return persistTokenResponse(data)
}

export async function login(): Promise<boolean> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  })

  const authCodePromise = waitForAuthCode()
  await shell.openExternal(`${AUTH_URL}?${params.toString()}`)
  const code = await authCodePromise
  await exchangeCode(code, codeVerifier)
  return true
}

export async function grantAccess(): Promise<boolean> {
  if (tokenStillValid()) return true

  const { accessToken, refreshToken } = getTokens()
  if (accessToken || refreshToken) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return true
  }

  return login()
}

/** Return a usable access token without hitting /me on every call. */
export async function getValidAccessToken(): Promise<string | null> {
  if (tokenStillValid()) {
    return getTokens().accessToken
  }

  const refreshed = await refreshAccessToken()
  if (refreshed) return refreshed

  const ok = await grantAccess()
  return ok ? getTokens().accessToken : null
}

export function logout(): void {
  clearTokens()
}

export function isLoggedIn(): boolean {
  return Boolean(getTokens().accessToken)
}
