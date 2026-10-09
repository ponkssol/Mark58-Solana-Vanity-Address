/// <reference lib="webworker" />
import nacl from 'tweetnacl'
import bs58 from 'bs58'

export type GrindRequest = { type: 'start'; prefix: string }

export type GrindResponse =
  | { type: 'progress'; attempts: number }
  | { type: 'found'; attempts: number; publicKey: string; secretKey: number[] }
  | { type: 'error'; message: string }

const PROGRESS_INTERVAL_MS = 250
const BATCH_SIZE = 64
const ED25519 = { name: 'Ed25519' } as const

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<GrindRequest>) => {
  if (event.data.type !== 'start') return
  const prefix = event.data.prefix
  supportsWebCrypto()
    .then((ok) => (ok ? grindWebCrypto(prefix) : grindTweetnacl(prefix)))
    .catch((err) => post({ type: 'error', message: String(err) }))
}

async function supportsWebCrypto(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey(ED25519, true, ['sign', 'verify'])
    return true
  } catch {
    return false
  }
}

// The main thread stops grinding by terminating the worker, so these loops never exit on their own.
async function grindWebCrypto(prefix: string) {
  const progress = progressReporter()

  for (;;) {
    const pairs = await Promise.all(
      Array.from({ length: BATCH_SIZE }, () => crypto.subtle.generateKey(ED25519, true, ['sign', 'verify'])),
    )
    const publicKeys = await Promise.all(pairs.map((p) => crypto.subtle.exportKey('raw', p.publicKey)))

    for (let i = 0; i < BATCH_SIZE; i++) {
      const publicKey = new Uint8Array(publicKeys[i])
      const address = bs58.encode(publicKey)
      progress.count()
      if (!address.startsWith(prefix)) continue

      // PKCS#8 for Ed25519 ends with the 32-byte seed; Solana's secret key is seed || publicKey.
      const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pairs[i].privateKey))
      const seed = pkcs8.slice(-32)
      const derived = nacl.sign.keyPair.fromSeed(seed)
      if (bs58.encode(derived.publicKey) !== address) {
        throw new Error('Exported seed does not match the public key')
      }
      progress.found(address, derived.secretKey)
      pkcs8.fill(0)
      seed.fill(0)
      return
    }

    progress.maybeReport()
  }
}

function grindTweetnacl(prefix: string) {
  const progress = progressReporter()

  for (;;) {
    for (let i = 0; i < BATCH_SIZE; i++) {
      const { publicKey, secretKey } = nacl.sign.keyPair()
      const address = bs58.encode(publicKey)
      progress.count()
      if (address.startsWith(prefix)) {
        progress.found(address, secretKey)
        return
      }
      secretKey.fill(0)
    }
    progress.maybeReport()
  }
}

function progressReporter() {
  let pending = 0
  let lastReport = performance.now()

  return {
    count() {
      pending++
    },
    maybeReport() {
      const now = performance.now()
      if (now - lastReport < PROGRESS_INTERVAL_MS) return
      post({ type: 'progress', attempts: pending })
      pending = 0
      lastReport = now
    },
    found(address: string, secretKey: Uint8Array) {
      post({ type: 'found', attempts: pending, publicKey: address, secretKey: Array.from(secretKey) })
      secretKey.fill(0)
    },
  }
}

function post(message: GrindResponse) {
  ctx.postMessage(message)
}
