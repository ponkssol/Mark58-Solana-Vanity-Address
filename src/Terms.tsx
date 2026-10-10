import type { ReactNode } from 'react'

const LAST_UPDATED = 'October 9, 2026'

export default function Terms() {
  return (
    <article className="legal">
      <header className="hero">
        <span className="eyebrow">// Legal</span>
        <h1>Terms of Use &amp; Privacy</h1>
        <p className="mono-muted">Last updated: {LAST_UPDATED}</p>
      </header>

      <LegalSection index="01" title="Overview">
        <p>
          Mark58 is a free tool that generates Solana keypairs whose public address starts with, ends with, or both
          (a "vanity address"). All computation runs locally in your browser. Mark58 has no backend server,
          no accounts, and no database.
        </p>
      </LegalSection>

      <LegalSection index="02" title="No custody">
        <p>
          Mark58 never receives, stores, or transmits your private keys. Keys exist only in your browser's memory
          until you copy, download, or clear them, or close the tab. We cannot see, recover, or restore any key
          generated with Mark58. If you lose your private key, the wallet and any funds in it are lost permanently.
        </p>
      </LegalSection>

      <LegalSection index="03" title="Your responsibility">
        <ul>
          <li>You are solely responsible for securely storing your private key and for any assets you send to it.</li>
          <li>
            Generate keys on a device you trust. For wallets that will hold significant value, consider disconnecting
            from the internet while generating and using a hardware wallet for long-term storage.
          </li>
          <li>Verify the address and keypair in your wallet before sending funds to it.</li>
        </ul>
      </LegalSection>

      <LegalSection index="04" title="Acceptable use">
        <p>You agree not to use Mark58 to:</p>
        <ul>
          <li>Impersonate another person, project, or wallet address, including "address poisoning" scams.</li>
          <li>Defraud, deceive, or harm others, or for any activity that is illegal where you live.</li>
        </ul>
      </LegalSection>

      <LegalSection index="05" title="No warranty">
        <p>
          Mark58 is provided "as is" and "as available", without warranties of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and non-infringement. Nothing on this site is
          financial, investment, legal, or tax advice.
        </p>
      </LegalSection>

      <LegalSection index="06" title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, the creators of Mark58 are not liable for any loss of funds, lost
          or compromised keys, or any direct, indirect, incidental, or consequential damages arising from your use
          of, or inability to use, Mark58.
        </p>
      </LegalSection>

      <LegalSection index="07" title="Privacy">
        <p>
          Mark58 does not collect personal data. There are no cookies, analytics, trackers, or third-party scripts.
          The production build enforces a Content Security Policy that prevents the page from connecting to any
          external server. Your hosting provider may keep standard server access logs (such as IP address and request time)
          when the page is loaded.
        </p>
      </LegalSection>

      <LegalSection index="08" title="Trademarks">
        <p>
          Mark58 is an independent project and is not affiliated with, endorsed by, or sponsored by the Solana
          Foundation or Solana Labs. "Solana" and related marks are trademarks of the Solana Foundation and are used
          here only to describe compatibility.
        </p>
      </LegalSection>

      <LegalSection index="09" title="Changes">
        <p>
          These terms may be updated from time to time. The date at the top of this page shows when they were last
          changed. Continued use of Mark58 after an update means you accept the revised terms.
        </p>
      </LegalSection>

      <a className="btn btn-secondary legal-back" href="#/">
        ← Back to generator
      </a>
    </article>
  )
}

function LegalSection({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <span className="eyebrow">// {index}</span>
      <h2>{title}</h2>
      {children}
    </section>
  )
}
