export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const KEY_BITS = 256n
const MAX_ADDR = 44

export function findInvalidChars(input: string): string[] {
  const bad = new Set<string>()
  for (const ch of input) {
    if (!BASE58_ALPHABET.includes(ch)) bad.add(ch)
  }
  return [...bad]
}

// P(random 32-byte pubkey, base58) starts with prefix.
// leading '1's are leading zero bytes (1/256 each).
export function prefixProbability(prefix: string): number {
  if (!prefix) return 1
  if (findInvalidChars(prefix).length) return 0

  let ones = 0
  while (ones < prefix.length && prefix[ones] === '1') ones++
  const rest = prefix.slice(ones)
  const bits = KEY_BITS - 8n * BigInt(ones)
  if (bits <= 0n) return 0

  const onesP = Math.pow(1 / 256, ones)
  if (!rest) return onesP

  const total = 1n << bits
  let value = 0n
  for (const ch of rest) value = value * 58n + BigInt(BASE58_ALPHABET.indexOf(ch))

  let count = 0n
  for (let len = rest.length; len <= MAX_ADDR; len++) {
    const scale = 58n ** BigInt(len - rest.length)
    const lo = value * scale
    if (lo >= total) break
    const hi = (value + 1n) * scale
    count += (hi < total ? hi : total) - lo
  }

  return onesP * bigRatio(count, total)
}

function bigRatio(num: bigint, den: bigint): number {
  if (num === 0n) return 0
  const shift = BigInt(Math.max(0, den.toString(2).length - 60))
  return Number(num >> shift) / Number(den >> shift)
}

export function expectedAttempts(prefix: string): number {
  const p = prefixProbability(prefix)
  return p > 0 ? 1 / p : Infinity
}
