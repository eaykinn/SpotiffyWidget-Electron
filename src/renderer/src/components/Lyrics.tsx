import { useEffect, useState } from 'react'
import { IconBack } from './Icons'

interface Props {
  song: string
  artist: string
  onBack: () => void
}

export default function Lyrics({ song, artist, onBack }: Props) {
  const [text, setText] = useState('Loading…')

  useEffect(() => {
    let cancelled = false
    void window.spotiffy.lyrics.fetch(song, artist).then((lyrics) => {
      if (!cancelled) setText(lyrics)
    })
    return () => {
      cancelled = true
    }
  }, [song, artist])

  return (
    <div className="scroll">
      <button className="back-btn" onClick={onBack}>
        <IconBack /> Back
      </button>
      <h3 style={{ fontFamily: 'var(--display)', marginBottom: 4 }}>{song}</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: 14, fontSize: 13 }}>{artist}</p>
      <div className="lyrics">{text}</div>
    </div>
  )
}
