const numberFormat = new Intl.NumberFormat('en-US')
const decimalFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const UNITS = ['', 'K', 'M', 'B', 'T', 'Q']

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  return numberFormat.format(Math.round(n))
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  if (n < 1000) return formatNumber(n)
  let unit = Math.min(Math.floor(Math.log10(n) / 3), UNITS.length - 1)
  let value = n / 1000 ** unit
  if (value >= 999.95 && unit < UNITS.length - 1) {
    unit++
    value = n / 1000 ** unit
  }
  return `${decimalFormat.format(value)}${UNITS[unit]}`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞'
  if (seconds < 1) return '< 1 sec'
  if (seconds < 60) return `${Math.round(seconds)} sec`
  const minutes = seconds / 60
  if (minutes < 60) return `${minutes.toFixed(1)} min`
  const hours = minutes / 60
  if (hours < 48) return `${hours.toFixed(1)} hours`
  const days = hours / 24
  if (days < 365) return `${days.toFixed(1)} days`
  return `${formatNumber(days / 365)} years`
}

export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (v: number) => String(v).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
