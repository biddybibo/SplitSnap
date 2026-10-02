// SplitSnap logo: torn-receipt mark + wordmark. Usage: <Logo /> or <Logo dark size={28} />
type Props = { size?: number; dark?: boolean; showWordmark?: boolean }

const LEFT = 'M28 16H57V94L53.375 100L49.75 94L46.125 100L42.5 94L38.875 100L35.25 94L31.625 100L28 94Z'
const RIGHT = 'M63 24H92V102L88.375 108L84.75 102L81.125 108L77.5 102L73.875 108L70.25 102L66.625 108L63 102Z'

export function Logo({ size = 32, dark = false, showWordmark = true }: Props) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.28 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        aria-hidden={showWordmark}
        role={showWordmark ? undefined : 'img'}
        aria-label={showWordmark ? undefined : 'SplitSnap'}
      >
        <path d={LEFT} fill={dark ? '#4F86E8' : '#1F5FD1'} />
        <path d={RIGHT} fill={dark ? '#FFFFFF' : '#16181D'} />
      </svg>
      {showWordmark && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: size * 0.72,
            letterSpacing: '-0.02em',
            color: dark ? '#FFFFFF' : '#16181D',
          }}
        >
          Split<span style={{ color: dark ? '#8FB0F0' : '#1F5FD1' }}>Snap</span>
        </span>
      )}
    </span>
  )
}
