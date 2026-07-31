import { useEffect, useRef, useState } from 'react'
import { IconVolume } from './Icons'
import RangeSlider from './RangeSlider'

type Level = 'mute' | 'low' | 'mid' | 'high'

function volumeLevel(v: number): Level {
  if (v <= 0) return 'mute'
  if (v <= 33) return 'low'
  if (v <= 66) return 'mid'
  return 'high'
}

interface Props {
  volume: number
  onVolumeChange: (v: number) => void
  onCommit: (v: number) => void
  onMuteToggle: () => void
  /** vertical = full player; horizontal = mini overlay */
  orientation?: 'vertical' | 'horizontal'
}

export default function VolumeControl({
  volume,
  onVolumeChange,
  onCommit,
  onMuteToggle,
  orientation = 'vertical'
}: Props) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const openNow = (): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(true)
  }

  const scheduleClose = (): void => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      closeTimer.current = null
    }, 180)
  }

  return (
    <div
      className={`volume volume--${orientation} ${open ? 'volume--open' : ''}`}
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
    >
      <div
        className={`volume__popup volume__popup--${orientation}`}
        aria-hidden={!open}
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
      >
        <RangeSlider
          className={orientation === 'vertical' ? 'volume__slider' : undefined}
          orient={orientation === 'vertical' ? 'vertical' : 'horizontal'}
          min={0}
          max={100}
          value={volume}
          title="Volume"
          onChange={onVolumeChange}
          onCommit={onCommit}
        />
      </div>
      <button className="icon-btn" onClick={onMuteToggle} title="Volume" type="button">
        <IconVolume level={volumeLevel(volume)} />
      </button>
    </div>
  )
}
