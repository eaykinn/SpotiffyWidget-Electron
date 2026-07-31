import { useEffect, useState } from 'react'
import { IconBack } from './Icons'

interface Props {
  song: string
  artist: string
  durationMs?: number
  onBack: () => void
}

export default function Lyrics({ song, artist, durationMs, onBack }: Props) {
  const [text, setText] = useState('Loading…')
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setText('Loading…')
    setError(false)

    void window.spotiffy.lyrics
      .fetch(song, artist, durationMs)
      .then((lyrics) => {
        if (cancelled) return
        setText(lyrics)
        setError(/not found|failed|Set GENIUS/i.test(lyrics))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(true)
        setText(err instanceof Error ? err.message : 'Could not load lyrics.')
      })

    return () => {
      cancelled = true
    }
  }, [song, artist, durationMs])

  return (
    <div className="glow-card lyrics-panel">
      <button className="back-btn" onClick={onBack}>
        <IconBack /> Back
      </button>
      <div className="lyrics-panel__header">
        <h3>{song}</h3>
        <p>{artist}</p>
      </div>
      <div className="scroll lyrics-panel__body">
        <div className={`lyrics ${error ? 'lyrics--muted' : ''}`}>{text}</div>
      </div>
    </div>
  )
}
