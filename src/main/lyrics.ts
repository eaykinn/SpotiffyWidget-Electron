/**
 * Lyrics: LRCLIB (no token) first, then Genius search + HTML scrape.
 */

export async function fetchLyrics(
  song: string,
  artist: string,
  durationMs?: number
): Promise<string> {
  const primaryArtist = primaryName(artist)
  const cleanSong = cleanTitle(song)

  try {
    const fromLrclib = await fetchFromLrclib(cleanSong, primaryArtist, durationMs)
    if (fromLrclib) return fromLrclib
  } catch (err) {
    console.error('LRCLIB lyrics failed:', err)
  }

  const token = process.env.GENIUS_ACCESS_TOKEN?.trim()
  if (!token) {
    return 'Lyrics not found.'
  }

  try {
    const fromGenius = await fetchFromGenius(cleanSong, primaryArtist, token)
    if (fromGenius) return fromGenius
  } catch (err) {
    console.error('Genius lyrics failed:', err)
  }

  return 'Lyrics not found.'
}

function primaryName(artist: string): string {
  return artist.split(',')[0]?.split('&')[0]?.trim() || artist.trim()
}

function cleanTitle(song: string): string {
  return song
    .replace(/\s*[([{].*?(feat|ft\.|with|remaster|live|version|edit|mix).*?[)\]}]/gi, '')
    .replace(/\s*[-–—]\s*(feat|ft\.).*$/i, '')
    .trim()
}

async function fetchFromLrclib(
  song: string,
  artist: string,
  durationMs?: number
): Promise<string | null> {
  const params = new URLSearchParams({
    track_name: song,
    artist_name: artist
  })
  if (durationMs && durationMs > 0) {
    params.set('duration', String(Math.round(durationMs / 1000)))
  }

  // Exact-ish get
  try {
    const getRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'SpotiffyWidget/1.0' }
    })
    if (getRes.ok) {
      const data = (await getRes.json()) as { plainLyrics?: string | null; instrumental?: boolean }
      if (data.instrumental) return '(Instrumental)'
      if (data.plainLyrics?.trim()) return data.plainLyrics.trim()
    }
  } catch {
    // fall through to search
  }

  const searchRes = await fetch(
    `https://lrclib.net/api/search?${new URLSearchParams({ q: `${song} ${artist}` }).toString()}`,
    { headers: { 'User-Agent': 'SpotiffyWidget/1.0' } }
  )
  if (!searchRes.ok) return null

  const results = (await searchRes.json()) as Array<{
    trackName?: string
    artistName?: string
    plainLyrics?: string | null
    instrumental?: boolean
  }>

  if (!Array.isArray(results) || results.length === 0) return null

  const songLower = song.toLowerCase()
  const artistLower = artist.toLowerCase()
  const best =
    results.find(
      (r) =>
        (r.trackName ?? '').toLowerCase().includes(songLower) &&
        (r.artistName ?? '').toLowerCase().includes(artistLower)
    ) ?? results[0]

  if (best.instrumental) return '(Instrumental)'
  return best.plainLyrics?.trim() || null
}

async function fetchFromGenius(
  song: string,
  artist: string,
  token: string
): Promise<string | null> {
  const query = `${song} ${artist}`
  const searchRes = await fetch(
    `https://api.genius.com/search?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!searchRes.ok) return null

  const data = (await searchRes.json()) as {
    response?: {
      hits?: Array<{
        result?: {
          artist_names?: string
          annotation_count?: number
          url?: string
          title?: string
        }
      }>
    }
  }

  const hits = data.response?.hits ?? []
  const artistLower = artist.toLowerCase()
  let bestUrl: string | undefined
  let maxAnn = -1

  for (const hit of hits) {
    const result = hit.result
    if (!result?.url) continue
    const names = (result.artist_names ?? '').toLowerCase()
    const ann = result.annotation_count ?? 0
    if (names.includes(artistLower) && ann > maxAnn) {
      maxAnn = ann
      bestUrl = result.url
    }
  }

  if (!bestUrl) bestUrl = hits[0]?.result?.url
  if (!bestUrl) return null

  const pageRes = await fetch(bestUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html'
    }
  })

  if (!pageRes.ok) return null

  const html = await pageRes.text()
  const lyrics = extractLyrics(html)
  return lyrics || null
}

function extractLyrics(html: string): string {
  const containers = extractLyricsContainers(html)
  if (containers.length > 0) {
    return containers.map(htmlToText).join('\n\n').trim()
  }

  const legacy = html.match(
    /class="lyrics"[^>]*>([\s\S]*?)<\/div>|class="Lyrics__Container[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  )
  if (legacy) {
    return htmlToText(legacy[1] || legacy[2]).trim()
  }

  return ''
}

/** Walk nested divs so Genius containers aren't cut off early. */
function extractLyricsContainers(html: string): string[] {
  const results: string[] = []
  const marker = 'data-lyrics-container="true"'
  let searchFrom = 0

  while (searchFrom < html.length) {
    const markerIdx = html.indexOf(marker, searchFrom)
    if (markerIdx === -1) break

    const start = html.lastIndexOf('<div', markerIdx)
    if (start === -1) {
      searchFrom = markerIdx + marker.length
      continue
    }

    let i = start
    let depth = 0
    let contentStart = -1

    while (i < html.length) {
      if (html.startsWith('</div>', i)) {
        depth--
        if (depth === 0 && contentStart !== -1) {
          results.push(html.slice(contentStart, i))
          searchFrom = i + 6
          break
        }
        i += 6
        continue
      }

      if (
        html.startsWith('<div', i) &&
        (html[i + 4] === ' ' || html[i + 4] === '>' || html[i + 4] === '\n' || html[i + 4] === '\r')
      ) {
        const gt = html.indexOf('>', i)
        if (gt === -1) break
        depth++
        if (depth === 1) contentStart = gt + 1
        i = gt + 1
        continue
      }

      i++
    }

    if (depth !== 0) break
  }

  return results
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
