/// <reference lib="webworker" />
import nacl from 'tweetnacl'
import bs58 from 'bs58'

export type GrindRequest = { type: 'start'; prefix: string; suffix: string }

export type GrindResponse =
  | { type: 'progress'; attempts: number }
  | { type: 'found'; attempts: number; publicKey: string; secretKey: number[] }
  | { type: 'error'; message: string }

const PROGRESS_MS = 250
const BATCH = 64
const ED25519 = { name: 'Ed25519' } as const

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (event: MessageEvent<GrindRequest>) => {
  if (event.data.type !== 'start') return
  try {
    const { prefix, suffix } = event.data
    if (await canUseWebCrypto()) await grindWebCrypto(prefix, suffix)
    else grindTweetnacl(prefix, suffix)
  } catch (err) {
    post({ type: 'error', message: String(err) })
  }
}

async function canUseWebCrypto() {
  try {
    await crypto.subtle.generateKey(ED25519, true, ['sign', 'verify'])
    return true
  } catch {
    return false
  }
}

function hits(address: string, prefix: string, suffix: string) {
  if (prefix && !address.startsWith(prefix)) return false
  if (suffix && !address.endsWith(suffix)) return false
  return true
}

async function grindWebCrypto(prefix: string, suffix: string) {
  const progress = makeProgress()

  while (true) {
    const pairs = await Promise.all(
      Array.from({ length: BATCH }, () => crypto.subtle.generateKey(ED25519, true, ['sign', 'verify'])),
    )
    const pubs = await Promise.all(pairs.map((p) => crypto.subtle.exportKey('raw', p.publicKey)))

    for (let i = 0; i < BATCH; i++) {
      const publicKey = new Uint8Array(pubs[i])
      const address = bs58.encode(publicKey)
      progress.count()
      if (!hits(address, prefix, suffix)) continue

      // pkcs8 for ed25519 ends with the 32-byte seed; solana secret = seed || pubkey
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

    progress.flush()
  }
}

function grindTweetnacl(prefix: string, suffix: string) {
  const progress = makeProgress()

  while (true) {
    for (let i = 0; i < BATCH; i++) {
      const { publicKey, secretKey } = nacl.sign.keyPair()
      const address = bs58.encode(publicKey)
      progress.count()
      if (hits(address, prefix, suffix)) {
        progress.found(address, secretKey)
        return
      }
      secretKey.fill(0)
    }
    progress.flush()
  }
}

function makeProgress() {
  let pending = 0
  let last = performance.now()

  return {
    count() {
      pending++
    },
    flush() {
      const now = performance.now()
      if (now - last < PROGRESS_MS) return
      post({ type: 'progress', attempts: pending })
      pending = 0
      last = now
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
