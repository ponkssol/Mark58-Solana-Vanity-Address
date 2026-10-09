import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import bs58 from 'bs58'
import { BASE58_ALPHABET, expectedAttempts, findInvalidChars, prefixProbability } from './lib/base58'
import { formatCompact, formatDuration, formatElapsed, formatNumber } from './lib/format'
import type { GrindRequest, GrindResponse } from './grindWorker'
import * as Icon from './icons'
import Terms from './Terms'

type Status = 'idle' | 'running' | 'found'

type Result = {
  prefix: string
  publicKey: string
  secretKey: Uint8Array
  attempts: number
  elapsedMs: number
}

// Rough single-thread Web Crypto throughput, used only until a real measurement exists.
const ASSUMED_KEYS_PER_SEC_PER_THREAD = 10000
const MAX_THREADS = navigator.hardwareConcurrency || 4
const UI_REFRESH_MS = 500
const MAX_PREFIX_LENGTH = 8
const ADDRESS_LENGTH = 44
// Leading characters below this probability are the "rare" ones (lowercase, J-Z).
const RARE_FIRST_CHAR_P = 0.02

function difficultyFor(seconds: number): { label: string; severe: boolean } {
  if (seconds < 10) return { label: 'Instant', severe: false }
  if (seconds < 300) return { label: 'Easy', severe: false }
  if (seconds < 3600) return { label: 'Moderate', severe: false }
  if (seconds < 86400) return { label: 'Hard', severe: true }
  return { label: 'Extreme', severe: true }
}

export default function App() {
  const route = useHashRoute()
  const [prefix, setPrefix] = useState('')
  const [threads, setThreads] = useState(Math.max(1, MAX_THREADS - 1))
  const [status, setStatus] = useState<Status>('idle')
  const [attempts, setAttempts] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [measuredRatePerThread, setMeasuredRatePerThread] = useState<number | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const workersRef = useRef<Worker[]>([])
  const attemptsRef = useRef(0)
  const startRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)

  const invalidChars = useMemo(() => findInvalidChars(prefix), [prefix])
  const isValid = prefix.length > 0 && invalidChars.length === 0
  const probability = useMemo(() => (isValid ? prefixProbability(prefix) : 0), [prefix, isValid])
  const expected = useMemo(() => (isValid ? expectedAttempts(prefix) : Infinity), [prefix, isValid])
  const rareFirstChar = isValid && prefixProbability(prefix[0]) < RARE_FIRST_CHAR_P

  const ratePerThread = measuredRatePerThread ?? ASSUMED_KEYS_PER_SEC_PER_THREAD
  const liveRate = status === 'running' && elapsedMs > 1000 ? attempts / (elapsedMs / 1000) : null
  const rate = liveRate ?? ratePerThread * threads
  const expectedSeconds = expected / rate
  const difficulty = difficultyFor(expectedSeconds)
  const foundChance = status === 'running' ? 1 - Math.pow(1 - probability, attempts) : status === 'found' ? 1 : 0
  const running = status === 'running'

  useEffect(() => () => stopWorkers(), [])

  function stopWorkers() {
    workersRef.current.forEach((w) => w.terminate())
    workersRef.current = []
    window.clearInterval(timerRef.current)
  }

  function recordRate(totalAttempts: number, ms: number, threadCount: number) {
    if (ms > 2000) setMeasuredRatePerThread(totalAttempts / (ms / 1000) / threadCount)
  }

  function start() {
    if (!isValid || running) return
    stopWorkers()
    clearResult()

    attemptsRef.current = 0
    startRef.current = performance.now()
    setAttempts(0)
    setElapsedMs(0)
    setError(null)
    setStatus('running')

    const threadCount = threads
    const request: GrindRequest = { type: 'start', prefix }

    for (let i = 0; i < threadCount; i++) {
      const worker = new Worker(new URL('./grindWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<GrindResponse>) => {
        const msg = event.data
        if (workersRef.current.length === 0) return
        if (msg.type === 'error') {
          stopWorkers()
          setError(msg.message)
          setStatus('idle')
          return
        }
        attemptsRef.current += msg.attempts
        if (msg.type !== 'found') return

        const ms = performance.now() - startRef.current
        stopWorkers()
        recordRate(attemptsRef.current, ms, threadCount)
        setAttempts(attemptsRef.current)
        setElapsedMs(ms)
        setResult({
          prefix: request.prefix,
          publicKey: msg.publicKey,
          secretKey: Uint8Array.from(msg.secretKey),
          attempts: attemptsRef.current,
          elapsedMs: ms,
        })
        setStatus('found')
      }
      worker.postMessage(request)
      workersRef.current.push(worker)
    }

    timerRef.current = window.setInterval(() => {
      setAttempts(attemptsRef.current)
      setElapsedMs(performance.now() - startRef.current)
    }, UI_REFRESH_MS)
  }

  function stop() {
    const ms = performance.now() - startRef.current
    stopWorkers()
    recordRate(attemptsRef.current, ms, threads)
    setAttempts(attemptsRef.current)
    setElapsedMs(ms)
    setStatus('idle')
  }

  function clearResult() {
    setResult((prev) => {
      prev?.secretKey.fill(0)
      return null
    })
  }

  if (route === 'terms') {
    return (
      <>
        <SiteNav />
        <main className="container">
          <Terms />
          <SiteFooter />
        </main>
      </>
    )
  }

  return (
    <>
      <SiteNav />

      <main className="container">
        <header className="hero">
          <span className="eyebrow">// Mark58 · Solana Vanity Address</span>
          <h1>Solana vanity address generator</h1>
          <p className="lead">
            Generate a Solana wallet address that starts with the characters you choose. Keypairs are created
            locally in your browser with Web Crypto and never leave your device.
          </p>
          <div className="tags">
            <span className="tag bracket">Built for Solana</span>
            <span className="tag">Ed25519</span>
            <span className="tag">Base58</span>
            <span className="tag">Multi-threaded</span>
            <span className="tag">No server</span>
          </div>
        </header>

        <section className="section">
          <span className="eyebrow">// Generator</span>

          <div className="panel generator">
            <div className="gen-main">
              <div className="row-between">
                <label htmlFor="prefix">Address prefix</label>
                <span className="mono-muted">
                  {prefix.length}/{MAX_PREFIX_LENGTH}
                </span>
              </div>

              <div className={`prefix-input ${invalidChars.length ? 'invalid' : ''}`}>
                <input
                  id="prefix"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value.trim())}
                  onKeyDown={(e) => e.key === 'Enter' && start()}
                  placeholder="e.g. Ponks"
                  maxLength={MAX_PREFIX_LENGTH}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={running}
                />
                {isValid && (
                  <span className={`tag bracket ${difficulty.severe ? 'tag-severe' : ''}`}>{difficulty.label}</span>
                )}
              </div>

              <div className="preview" aria-label="Address preview">
                {Array.from(prefix).map((ch, i) => (
                  <span key={i} className={BASE58_ALPHABET.includes(ch) ? 'match' : 'bad'}>
                    {ch}
                  </span>
                ))}
                <span className="rest">{'X'.repeat(ADDRESS_LENGTH - prefix.length)}</span>
              </div>

              {invalidChars.length > 0 ? (
                <Notice tone="error">
                  Invalid character{invalidChars.length > 1 ? 's' : ''}: <code>{invalidChars.join(' ')}</code>.
                  Solana addresses use Base58, which excludes <code>0</code> <code>O</code> <code>I</code>{' '}
                  <code>l</code>.
                </Notice>
              ) : (
                <p className="hint">
                  Case-sensitive. Base58 only — <code>0</code> <code>O</code> <code>I</code> <code>l</code> are not
                  allowed.
                </p>
              )}

              {rareFirstChar && (
                <Notice tone="info">
                  Addresses rarely start with <code>{prefix[0]}</code>. Prefixes starting with <code>2–9</code> or{' '}
                  <code>A–H</code> are roughly 17× faster to find.
                </Notice>
              )}
            </div>

            <div className="gen-side">
              <div className="grid grid-2">
                <Cell
                  label="Expected attempts"
                  value={isValid ? formatCompact(expected) : '—'}
                  title={isValid ? formatNumber(expected) : undefined}
                />
                <Cell
                  label={measuredRatePerThread === null && !running ? 'Est. time · rough' : 'Est. time'}
                  value={isValid ? `~${formatDuration(expectedSeconds)}` : '—'}
                />
              </div>

              <div className="threads">
                <div className="row-between">
                  <label htmlFor="threads">CPU threads</label>
                  <span className="mono-muted">
                    {threads} / {MAX_THREADS}
                  </span>
                </div>
                <input
                  id="threads"
                  type="range"
                  min={1}
                  max={MAX_THREADS}
                  value={threads}
                  onChange={(e) => setThreads(Number(e.target.value))}
                  disabled={running}
                  style={{ '--fill': `${((threads - 1) / Math.max(MAX_THREADS - 1, 1)) * 100}%` } as CSSProperties}
                />
              </div>

              {isValid && expectedSeconds > 3600 && !running && (
                <Notice tone="warn">
                  This prefix may take a long time. Keep this tab open and prevent your computer from sleeping.
                </Notice>
              )}

              {running ? (
                <button className="btn btn-secondary btn-block" onClick={stop}>
                  Stop search
                </button>
              ) : (
                <button className="btn btn-primary btn-block" onClick={start} disabled={!isValid}>
                  Generate address <span aria-hidden>→</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {(running || attempts > 0) && (
          <section className="section">
            <div className="row-between">
              <span className="eyebrow">// Progress</span>
              <span className={`tag bracket ${running ? 'tag-live' : ''}`}>
                {running && <span className="dot" />}
                {running ? 'Searching' : status === 'found' ? 'Found' : 'Stopped'}
              </span>
            </div>
            <div className="panel panel-flush">
              <div className="progress" aria-label="Chance found">
                <div className="progress-fill" style={{ width: `${Math.min(foundChance, 1) * 100}%` }} />
              </div>
              <div className="grid grid-4">
                <Cell label="Attempts" value={formatCompact(attempts)} title={formatNumber(attempts)} />
                <Cell label="Speed" value={`${formatNumber(attempts / Math.max(elapsedMs / 1000, 0.001))}/s`} />
                <Cell label="Elapsed" value={formatElapsed(elapsedMs)} />
                <Cell label="Chance found" value={`${(foundChance * 100).toFixed(1)}%`} />
              </div>
            </div>
          </section>
        )}

        {error && <Notice tone="error">Something went wrong while generating: {error}</Notice>}

        {result && <ResultCard result={result} onClear={clearResult} />}

        <SiteFooter />
      </main>
    </>
  )
}

type Route = 'home' | 'terms'

function routeFromHash(): Route {
  return window.location.hash === '#/terms' ? 'terms' : 'home'
}

function useHashRoute(): Route {
  const [route, setRoute] = useState(routeFromHash)

  useEffect(() => {
    const onChange = () => {
      setRoute(routeFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

function SiteNav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a className="brand" href="#/">
          <Icon.Logo />
          <span>Mark58</span>
          <span className="brand-tagline">Solana Vanity Address</span>
        </a>
        <div className="nav-links">
          <a href="#/terms">Terms</a>
          <span className="tag tag-live">
            <span className="dot" /> Client-side
          </span>
        </div>
      </div>
    </nav>
  )
}

function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-col">
          <span className="eyebrow">// Security</span>
          <p>
            Store your private key offline. Anyone who has it has full control of the wallet. No keys are stored,
            logged, or sent anywhere.
          </p>
        </div>
        <div className="footer-col">
          <span className="eyebrow">// Disclaimer</span>
          <p>
            Provided "as is", without warranty of any kind. You are solely responsible for your keys and funds. Not
            financial advice.
          </p>
        </div>
        <div className="footer-col">
          <span className="eyebrow">// Builder</span>
          <a className="builder-link" href="https://x.com/ponkssol" target="_blank" rel="noopener noreferrer">
            <span className="builder-name">Ponks solomon</span>
            <span className="builder-handle">@ponkssol on X ↗</span>
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Mark58 · Built for Solana</span>
        <span>
          Not affiliated with, endorsed by, or sponsored by the Solana Foundation. "Solana" is a trademark of the
          Solana Foundation.
        </span>
        <a href="#/terms">Terms &amp; Privacy</a>
      </div>
    </footer>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'warn' | 'info'; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`}>
      <span className="notice-label">{tone === 'error' ? 'Error' : tone === 'warn' ? 'Note' : 'Tip'}</span>
      <p>{children}</p>
    </div>
  )
}

function Cell({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="cell" title={title}>
      <span className="cell-label">{label}</span>
      <span className="cell-value">{value}</span>
    </div>
  )
}

function ResultCard({ result, onClear }: { result: Result; onClear: () => void }) {
  const prefixLength = result.prefix.length
  const [revealed, setRevealed] = useState(false)
  const privateKey = useMemo(() => bs58.encode(result.secretKey), [result])
  const jsonArray = useMemo(() => JSON.stringify(Array.from(result.secretKey)), [result])

  function download() {
    const blob = new Blob([jsonArray], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.publicKey}-keypair.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="section">
      <span className="eyebrow">// Result</span>
      <div className="panel">
        <div className="result-header">
          <span className="icon-box bracket">
            <Icon.Check />
          </span>
          <div>
            <h2>Match found</h2>
            <p className="mono-muted">
              {formatNumber(result.attempts)} attempts · {formatElapsed(result.elapsedMs)}
            </p>
          </div>
        </div>

        <KeyField label="Public address" copyValue={result.publicKey} large>
          <span className="match">{result.publicKey.slice(0, prefixLength)}</span>
          {result.publicKey.slice(prefixLength)}
        </KeyField>

        <KeyField label="Private key · Base58 (Phantom, Solflare)" copyValue={privateKey} secret={!revealed}>
          {privateKey}
        </KeyField>

        <KeyField label="Keypair · JSON byte array (Solana CLI)" copyValue={jsonArray} secret={!revealed}>
          {jsonArray}
        </KeyField>

        <div className="actions">
          <button className="btn btn-primary" onClick={() => setRevealed((v) => !v)}>
            {revealed ? <Icon.EyeOff /> : <Icon.Eye />} {revealed ? 'Hide keys' : 'Reveal keys'}
          </button>
          <button className="btn btn-secondary" onClick={download}>
            <Icon.Download /> Download .json
          </button>
          <button className="btn btn-secondary btn-danger" onClick={onClear}>
            <Icon.Trash /> Clear
          </button>
        </div>
      </div>
    </section>
  )
}

function KeyField({
  label,
  copyValue,
  secret = false,
  large = false,
  children,
}: {
  label: string
  copyValue: string
  secret?: boolean
  large?: boolean
  children: ReactNode
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(copyValue)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="key-field">
      <div className="row-between">
        <span className="cell-label">{label}</span>
        <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy}>
          {copied ? <Icon.Check /> : <Icon.Copy />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={`key-value ${large ? 'large' : ''} ${secret ? 'blurred' : ''}`}>{children}</div>
    </div>
  )
}
