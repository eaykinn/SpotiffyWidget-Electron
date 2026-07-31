/**
 * Genius lyrics helper — token from GENIUS_ACCESS_TOKEN env var.
 * Scrapes lyrics HTML similar to the WPF GeniusApi helper.
 */

export async function fetchLyrics(song: string, artist: string): Promise<string> {
  const token = process.env.GENIUS_ACCESS_TOKEN
  if (!token) {
    return 'Set GENIUS_ACCESS_TOKEN to enable lyrics.'
  }

  const query = `${song} ${artist}`
  const searchRes = await fetch(
    `https://api.genius.com/search?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!searchRes.ok) {
    return 'Lyrics search failed.'
  }

  const data = (await searchRes.json()) as {
    response?: {
      hits?: Array<{
        result?: {
          artist_names?: string
          annotation_count?: number
          url?: string
        }
      }>
    }
  }

  const hits = data.response?.hits ?? []
  let bestUrl: string | undefined
  let maxAnn = -1

  for (const hit of hits) {
    const result = hit.result
    if (!result?.url) continue
    const names = result.artist_names ?? ''
    const ann = result.annotation_count ?? 0
    if (names.toLowerCase().includes(artist.toLowerCase()) && ann > maxAnn) {
      maxAnn = ann
      bestUrl = result.url
    }
  }

  if (!bestUrl && hits[0]?.result?.url) {
    bestUrl = hits[0].result.url
  }

  if (!bestUrl) {
    return 'Lyrics not found.'
  }

  const pageRes = await fetch(bestUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  })

  if (!pageRes.ok) {
    return 'Could not load lyrics page.'
  }

  const html = await pageRes.text()
  return extractLyrics(html) || 'Lyrics not found.'
}

function extractLyrics(html: string): string {
  // Prefer data-lyrics-container blocks used by modern Genius pages
  const containers = [
    ...html.matchAll(
      /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi
    )
  ]

  if (containers.length > 0) {
    return containers
      .map((m) => htmlToText(m[1]))
      .join('\n\n')
      .trim()
  }

  const legacy = html.match(
    /<div class="lyrics">([\s\S]*?)<\/div>|<div class="Lyrics__Container[\s\S]*?>([\s\S]*?)<\/div>/i
  )
  if (legacy) {
    return htmlToText(legacy[1] || legacy[2]).trim()
  }

  return ''
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
    .replace(/\n{3,}/g, '\n\n')
}
