import type { TrackSortDir, TrackSortKey } from '../lib/trackSort'

const KEYS: { key: TrackSortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'added', label: 'Added' },
  { key: 'duration', label: 'Duration' }
]

interface Props {
  sortKey: TrackSortKey
  sortDir: TrackSortDir
  onChange: (key: TrackSortKey, dir: TrackSortDir) => void
  /** Hide Added when the list never has dates (album/artist). */
  showAdded?: boolean
}

export default function TrackSortBar({
  sortKey,
  sortDir,
  onChange,
  showAdded = true
}: Props) {
  const keys = showAdded ? KEYS : KEYS.filter((k) => k.key !== 'added')

  return (
    <div className="track-sort" role="group" aria-label="Sort tracks">
      {keys.map(({ key, label }) => {
        const active = sortKey === key
        return (
          <button
            key={key}
            type="button"
            className={`track-sort__btn ${active ? 'active' : ''}`}
            title={
              active
                ? `Sort by ${label} (${sortDir === 'asc' ? 'ascending' : 'descending'}) — click to reverse`
                : `Sort by ${label}`
            }
            onClick={() => {
              if (active) onChange(key, sortDir === 'asc' ? 'desc' : 'asc')
              else onChange(key, key === 'added' ? 'desc' : 'asc')
            }}
          >
            {label}
            {active && <span className="track-sort__dir">{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </button>
        )
      })}
    </div>
  )
}
