import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import bs58 from 'bs58'
import { BASE58_ALPHABET, comboProbability, expectedAttempts, findInvalidChars, prefixProbability } from './lib/base58'
import { formatCompact, formatDuration, formatElapsed, formatNumber } from './lib/format'
import type { GrindRequest, GrindResponse } from './grindWorker'
import { Check, Copy, Download, Eye, EyeOff, Logo, Trash } from './icons'
import Terms from './Terms'

type Status = 'idle' | 'running' | 'found'
type Route = 'home' | 'terms'
type MatchMode = 'start' | 'end' | 'both'

type Result = {
  prefix: string
  suffix: string
  publicKey: string
  secretKey: Uint8Array
  attempts: number
  elapsedMs: number
}

const KEYS_PER_SEC = 10_000
const MAX_THREADS = navigator.hardwareConcurrency || 4
const TICK_MS = 500
const MAX_PREFIX = 8
const ADDR_LEN = 44

function difficultyFor(seconds: number) {
  if (seconds < 10) return { label: 'Instant', severe: false }
  if (seconds < 300) return { label: 'Easy', severe: false }
  if (seconds < 3600) return { label: 'Moderate', severe: false }
  if (seconds < 86400) return { label: 'Hard', severe: true }
  return { label: 'Extreme', severe: true }
}

export default function App() {
  const route = useHashRoute()
  const [mode, setMode] = useState<MatchMode>('start')
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [threads, setThreads] = useState(Math.max(1, MAX_THREADS - 1))
  const [status, setStatus] = useState<Status>('idle')
  const [attempts, setAttempts] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [measuredRate, setMeasuredRate] = useState<number | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  const workersRef = useRef<Worker[]>([])
  const attemptsRef = useRef(0)
  const startRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)

  const activePrefix = mode === 'end' ? '' : prefix
  const activeSuffix = mode === 'start' ? '' : suffix
  const badPrefix = findInvalidChars(activePrefix)
  const badSuffix = findInvalidChars(activeSuffix)
  const invalidChars = [...new Set([...badPrefix, ...badSuffix])]
  const hasPattern =
    mode === 'both' ? activePrefix.length > 0 && activeSuffix.length > 0 : activePrefix.length > 0 || activeSuffix.length > 0
  const isValid = hasPattern && invalidChars.length === 0
  const probability = isValid ? comboProbability(activePrefix, activeSuffix) : 0
  const expected = isValid ? expectedAttempts(activePrefix, activeSuffix) : Infinity
  const rareStart = activePrefix.length > 0 && badPrefix.length === 0 && prefixProbability(activePrefix[0]) < 0.02

  const perThread = measuredRate ?? KEYS_PER_SEC
  const liveRate = status === 'running' && elapsedMs > 1000 ? attempts / (elapsedMs / 1000) : null
  const rate = liveRate ?? perThread * threads
  const expectedSeconds = expected / rate
  const difficulty = difficultyFor(expectedSeconds)
  const foundChance = status === 'running' ? 1 - Math.pow(1 - probability, attempts) : status === 'found' ? 1 : 0
  const running = status === 'running'

  useEffect(() => {
    return () => stopWorkers()
  }, [])

  function stopWorkers() {
    for (const w of workersRef.current) w.terminate()
    workersRef.current = []
    window.clearInterval(timerRef.current)
  }

  function recordRate(total: number, ms: number, n: number) {
    if (ms > 2000) setMeasuredRate(total / (ms / 1000) / n)
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

    const n = threads
    const req: GrindRequest = { type: 'start', prefix: activePrefix, suffix: activeSuffix }

    for (let i = 0; i < n; i++) {
      const worker = new Worker(new URL('./grindWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<GrindResponse>) => {
        const msg = e.data
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
        recordRate(attemptsRef.current, ms, n)
        setAttempts(attemptsRef.current)
        setElapsedMs(ms)
        setResult({
          prefix: req.prefix,
          suffix: req.suffix,
          publicKey: msg.publicKey,
          secretKey: Uint8Array.from(msg.secretKey),
          attempts: attemptsRef.current,
          elapsedMs: ms,
        })
        setStatus('found')
      }
      worker.postMessage(req)
      workersRef.current.push(worker)
    }

    timerRef.current = window.setInterval(() => {
      setAttempts(attemptsRef.current)
      setElapsedMs(performance.now() - startRef.current)
    }, TICK_MS)
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
            Grind a Solana address that starts with, ends with, or both. Keypairs are generated in this tab and never
            leave your machine.
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
              <div className="match-bar">
                <div className="match-at" role="group" aria-label="Match position">
                  <button type="button" className={mode === 'start' ? 'active' : ''} onClick={() => setMode('start')} disabled={running}>
                    Starts with
                  </button>
                  <button type="button" className={mode === 'end' ? 'active' : ''} onClick={() => setMode('end')} disabled={running}>
                    Ends with
                  </button>
                  <button type="button" className={mode === 'both' ? 'active' : ''} onClick={() => setMode('both')} disabled={running}>
                    Both
                  </button>
                </div>
                {mode !== 'both' && (
                  <span className="mono-muted">
                    {(mode === 'end' ? suffix : prefix).length}/{MAX_PREFIX}
                  </span>
                )}
              </div>

              <div className={`pattern-grid ${mode === 'both' ? 'both' : ''}`}>
                {mode !== 'end' && (
                  <PatternField
                    id="prefix"
                    label="Starts with"
                    value={prefix}
                    onChange={setPrefix}
                    onEnter={start}
                    placeholder="e.g. Ponks"
                    invalid={badPrefix.length > 0}
                    disabled={running}
                    tag={isValid ? difficulty : null}
                    showTag={mode !== 'both'}
                    showLabel={mode === 'both'}
                  />
                )}
                {mode !== 'start' && (
                  <PatternField
                    id="suffix"
                    label="Ends with"
                    value={suffix}
                    onChange={setSuffix}
                    onEnter={start}
                    placeholder="e.g. pump"
                    invalid={badSuffix.length > 0}
                    disabled={running}
                    tag={isValid ? difficulty : null}
                    showTag={mode === 'end'}
                    showLabel={mode === 'both'}
                  />
                )}
              </div>

              {mode === 'both' && isValid && (
                <span className={`tag bracket ${difficulty.severe ? 'tag-severe' : ''}`}>{difficulty.label}</span>
              )}

              <div className="preview" aria-label="Address preview">
                <PatternChars value={activePrefix} />
                <span className="rest">
                  {'X'.repeat(Math.max(ADDR_LEN - activePrefix.length - activeSuffix.length, 0))}
                </span>
                <PatternChars value={activeSuffix} />
              </div>

              {invalidChars.length > 0 ? (
                <Notice tone="error">
                  Invalid character{invalidChars.length > 1 ? 's' : ''}: <code>{invalidChars.join(' ')}</code>. Base58
                  skips <code>0</code> <code>O</code> <code>I</code> <code>l</code>.
                </Notice>
              ) : (
                <p className="hint">
                  Case-sensitive. Base58 only — <code>0</code> <code>O</code> <code>I</code> <code>l</code> are not
                  allowed.
                </p>
              )}

              {rareStart && (
                <Notice tone="info">
                  Addresses rarely start with <code>{activePrefix[0]}</code>. Prefixes starting with <code>2–9</code> or{' '}
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
                  label={measuredRate === null && !running ? 'Est. time · rough' : 'Est. time'}
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
                  This could take a while. Don't close the tab or let the machine sleep.
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

        {error && <Notice tone="error">{error}</Notice>}

        {result && <ResultCard result={result} onClear={clearResult} />}

        <SiteFooter />
      </main>
    </>
  )
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    window.location.hash === '#/terms' ? 'terms' : 'home',
  )

  useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash === '#/terms' ? 'terms' : 'home')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return route
}

function SiteNav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a className="brand" href="#/">
          <Logo />
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
  const label = tone === 'error' ? 'Error' : tone === 'warn' ? 'Note' : 'Tip'
  return (
    <div className={`notice notice-${tone}`}>
      <span className="notice-label">{label}</span>
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

function PatternField({
  id,
  label,
  value,
  onChange,
  onEnter,
  placeholder,
  invalid,
  disabled,
  tag,
  showTag,
  showLabel,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  placeholder: string
  invalid: boolean
  disabled: boolean
  tag: { label: string; severe: boolean } | null
  showTag: boolean
  showLabel: boolean
}) {
  return (
    <div>
      {showLabel && (
        <div className="row-between">
          <label htmlFor={id}>{label}</label>
          <span className="mono-muted">
            {value.length}/{MAX_PREFIX}
          </span>
        </div>
      )}
      <div className={`prefix-input ${invalid ? 'invalid' : ''}`}>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter()
          }}
          placeholder={placeholder}
          maxLength={MAX_PREFIX}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          aria-label={label}
        />
        {showTag && tag && (
          <span className={`tag bracket ${tag.severe ? 'tag-severe' : ''}`}>{tag.label}</span>
        )}
      </div>
    </div>
  )
}

function PatternChars({ value }: { value: string }) {
  return (
    <>
      {Array.from(value).map((ch, i) => (
        <span key={`${ch}${i}`} className={BASE58_ALPHABET.includes(ch) ? 'match' : 'bad'}>
          {ch}
        </span>
      ))}
    </>
  )
}

function ResultCard({ result, onClear }: { result: Result; onClear: () => void }) {
  const [revealed, setRevealed] = useState(false)
  const privateKey = bs58.encode(result.secretKey)
  const jsonArray = JSON.stringify(Array.from(result.secretKey))
  const addr = result.publicKey
  const start = result.prefix.length
  const end = result.suffix.length ? addr.length - result.suffix.length : addr.length

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
            <Check />
          </span>
          <div>
            <h2>Match found</h2>
            <p className="mono-muted">
              {formatNumber(result.attempts)} attempts · {formatElapsed(result.elapsedMs)}
            </p>
          </div>
        </div>

        <KeyField label="Public address" copyValue={result.publicKey} large>
          {result.prefix ? <span className="match">{addr.slice(0, start)}</span> : null}
          {addr.slice(start, end)}
          {result.suffix ? <span className="match">{addr.slice(end)}</span> : null}
        </KeyField>

        <KeyField label="Private key · Base58 (Phantom, Solflare)" copyValue={privateKey} secret={!revealed}>
          {privateKey}
        </KeyField>

        <KeyField label="Keypair · JSON byte array (Solana CLI)" copyValue={jsonArray} secret={!revealed}>
          {jsonArray}
        </KeyField>

        <div className="actions">
          <button className="btn btn-primary" onClick={() => setRevealed((v) => !v)}>
            {revealed ? <EyeOff /> : <Eye />} {revealed ? 'Hide keys' : 'Reveal keys'}
          </button>
          <button className="btn btn-secondary" onClick={download}>
            <Download /> Download .json
          </button>
          <button className="btn btn-secondary btn-danger" onClick={onClear}>
            <Trash /> Clear
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
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={`key-value ${large ? 'large' : ''} ${secret ? 'blurred' : ''}`}>{children}</div>
    </div>
  )
}
