import type { CSSProperties } from 'react'

interface Props {
  min?: number
  max: number
  value: number
  disabled?: boolean
  className?: string
  title?: string
  orient?: 'horizontal' | 'vertical'
  onChange: (value: number) => void
  onCommit?: (value: number) => void
}

export default function RangeSlider({
  min = 0,
  max,
  value,
  disabled,
  className = '',
  title,
  orient = 'horizontal',
  onChange,
  onCommit
}: Props) {
  const safeMax = max > min ? max : min + 1
  const clamped = Math.min(Math.max(value, min), safeMax)
  const pct = ((clamped - min) / (safeMax - min)) * 100

  const style = {
    '--pct': `${pct}%`
  } as CSSProperties

  return (
    <input
      type="range"
      className={`range ${orient === 'vertical' ? 'range--vertical' : ''} ${className}`.trim()}
      min={min}
      max={safeMax}
      value={clamped}
      disabled={disabled}
      title={title}
      style={style}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  )
}
