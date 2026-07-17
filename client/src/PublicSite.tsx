import React, { FormEvent, ReactNode, useState } from 'react';
import './PublicSite.css';

export type PublicPath = '/' | '/about' | '/features' | '/pricing' | '/docs' | '/contact';

const navigation: Array<{ path: PublicPath; label: string }> = [
  { path: '/', label: 'Home' },
  { path: '/features', label: 'Features' },
  { path: '/pricing', label: 'Pricing' },
];

function PublicLink({ path, currentPath, onNavigate, children, className = '' }: {
  path: string;
  currentPath?: string;
  onNavigate: (path: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return <a className={className} href={path} aria-current={currentPath === path ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onNavigate(path); }}>{children}</a>;
}

function SiteHeader({ path, onNavigate }: { path: PublicPath; onNavigate: (path: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (nextPath: string) => { setMenuOpen(false); onNavigate(nextPath); };
  return <header className="public-header">
    <PublicLink path="/" onNavigate={go} className="public-brand">Working<span>Beam</span></PublicLink>
    <button className="public-menu-button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
    <nav className={menuOpen ? 'public-nav open' : 'public-nav'} aria-label="Public navigation">
      {navigation.map((item) => <PublicLink key={item.path} path={item.path} currentPath={path} onNavigate={go}>{item.label}</PublicLink>)}
    </nav>
    <div className="public-auth-actions">
      <PublicLink path="/auth" onNavigate={go} className="public-signin">Sign in</PublicLink>
      <PublicLink path="/auth?mode=register" onNavigate={go} className="public-get-started">Get started</PublicLink>
    </div>
  </header>;
}

function SiteFooter({ onNavigate }: { onNavigate: (path: string) => void }) {
  return <footer className="public-footer">
    <div><div className="public-brand footer-brand">Working<span>Beam</span></div><p>Private freelance payments with visible milestones and protected delivery.</p></div>
    <div><strong>Product</strong><PublicLink path="/features" onNavigate={onNavigate}>Features</PublicLink><PublicLink path="/pricing" onNavigate={onNavigate}>Pricing</PublicLink><PublicLink path="/docs" onNavigate={onNavigate}>Documentation</PublicLink></div>
    <div><strong>Company</strong><PublicLink path="/about" onNavigate={onNavigate}>About</PublicLink><PublicLink path="/contact" onNavigate={onNavigate}>Contact</PublicLink><PublicLink path="/auth" onNavigate={onNavigate}>Sign in</PublicLink></div>
    <div className="footer-bottom"><span>(c) 2026 WorkingBeam</span><span>Built for clear work and private payments.</span></div>
  </footer>;
}

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section className="public-page-intro"><p className="public-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></section>;
}

function LandingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return <>
    <section className="landing-hero">
      <div className="landing-copy">
        <p className="public-eyebrow">Freelance payments on Beam</p>
        <h1>Work with confidence.<br /><span>Get paid privately.</span></h1>
        <p>WorkingBeam gives freelancers and clients one clear path from payment request to escrow, delivery, and confirmed release.</p>
        <div className="landing-actions"><PublicLink path="/auth?mode=register" onNavigate={onNavigate} className="public-primary">Create your workspace</PublicLink><PublicLink path="/features" onNavigate={onNavigate} className="public-secondary">Explore features</PublicLink></div>
        <div className="landing-proof"><span>Role-aware workflows</span><span>Beam confirmations</span><span>Dispute records</span></div>
      </div>
      <div className="landing-visual" aria-label="Example protected payment request">
        <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
        <article className="demo-payment-card">
          <div className="demo-card-top"><div><small>ACTIVE MILESTONE</small><h3>Product launch design</h3></div><span>Funded</span></div>
          <div className="demo-amount"><strong>420.00</strong><em>BEAM</em></div>
          <div className="demo-party"><i>A</i><div><small>Freelancer</small><b>Amina Deng</b></div><strong>Protected</strong></div>
          <div className="demo-progress"><i /><i /><i /><i /><i /></div>
          <div className="demo-labels"><span>Request</span><span>Approve</span><span>Fund</span><span>Deliver</span><span>Release</span></div>
        </article>
        <div className="demo-confirmation"><i>OK</i><div><small>ON-CHAIN STATUS</small><strong>Escrow confirmed</strong></div></div>
      </div>
    </section>
    <section className="public-trust-strip"><span>PAYMENT REQUESTS</span><span>BEAM WALLET API</span><span>ESCROW WORKFLOW</span><span>AUDIT HISTORY</span></section>
    <section className="public-section centered-section">
      <p className="public-eyebrow">A shared source of truth</p><h2>From agreement to payment in five clear steps.</h2><p className="section-lead">Both sides see the same milestone, amount, delivery state, and blockchain confirmation.</p>
      <div className="steps-grid">{[
        ['01','Request','The freelancer defines the work, amount, and due date.'],
        ['02','Approve','The client reviews the milestone before funds move.'],
        ['03','Protect','The client funds escrow through the Beam wallet rail.'],
        ['04','Deliver','The freelancer submits the completed work and delivery note.'],
        ['05','Release','The client releases payment after reviewing delivery.'],
      ].map(([number,title,text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>
    <section className="public-section split-section">
      <div className="split-copy"><p className="public-eyebrow">Built for both sides</p><h2>One workspace. Two focused experiences.</h2><p>Freelancers stay close to earnings and delivery. Clients stay close to approvals, protected funds, and release decisions.</p><PublicLink path="/about" onNavigate={onNavigate} className="text-link">Why WorkingBeam -&gt;</PublicLink></div>
      <div className="role-panels"><article><span>F</span><h3>For freelancers</h3><ul><li>Create clear payment requests</li><li>Track protected funds</li><li>Submit work with context</li><li>Confirm completed releases</li></ul></article><article><span>C</span><h3>For clients</h3><ul><li>Review every milestone</li><li>Approve before funding</li><li>Release after delivery</li><li>Keep a complete activity record</li></ul></article></div>
    </section>
    <section className="public-cta"><div><p className="public-eyebrow">Ready for a clearer workflow?</p><h2>Protect the payment. Focus on the work.</h2></div><PublicLink path="/auth?mode=register" onNavigate={onNavigate} className="public-primary light-action">Start with WorkingBeam</PublicLink></section>
  </>;
}

function AboutPage() {
  return <>
    <PageIntro eyebrow="About WorkingBeam" title="Freelance trust should be designed into the payment." description="WorkingBeam brings agreements, delivery, escrow, and Beam confirmation into one shared workflow for freelancers and clients." />
    <section className="public-section about-story"><div><p className="public-eyebrow">Our purpose</p><h2>Make cross-border digital work feel accountable without making it intrusive.</h2></div><div><p>Independent work often depends on screenshots, scattered messages, and trust that payment will arrive after delivery. Clients face the opposite uncertainty: paying before they can verify the result.</p><p>WorkingBeam closes that gap with explicit milestones, protected funding, delivery records, role-based actions, and visible blockchain confirmation.</p></div></section>
    <section className="public-section values-section"><p className="public-eyebrow">What guides us</p><div className="values-grid">{[
      ['Clarity over complexity','Every payment state should tell both parties what happened and what comes next.'],
      ['Privacy with accountability','Use Beam as the payment rail while keeping business actions visible to the people involved.'],
      ['Protection for both roles','Freelancers need confidence in funding. Clients need control over approval and release.'],
      ['Security by construction','Validate actions, addresses, roles, and transitions on the server, not only in the interface.'],
    ].map(([title,text],index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="public-section about-architecture"><div><p className="public-eyebrow">The system</p><h2>A deliberate path from people to confirmation.</h2></div><div className="architecture-flow"><span>Freelancer + Client</span><i>-&gt;</i><span>WorkingBeam workspace</span><i>-&gt;</i><span>Payment request + escrow</span><i>-&gt;</i><span>Beam Wallet API</span><i>-&gt;</i><span>On-chain confirmation</span></div></section>
  </>;
}

function FeaturesPage() {
  const features = [
    ['01','Payment requests','Define the title, scope, BEAM amount, client, and due date in a structured milestone.'],
    ['02','Protected escrow','Move approved funds into a visible protected state before work is delivered.'],
    ['03','Delivery workflow','Attach a delivery note or work link before the client makes a release decision.'],
    ['04','Beam confirmation','Submit transfers through the Wallet API and track pending, confirmed, or failed states.'],
    ['!','Dispute records','Let either party open a dispute while protected funds are held, with a recorded reason.'],
    ['06','Role-aware dashboards','Give freelancers and clients the metrics, actions, and history relevant to their role.'],
    ['07','Wallet validation','Reject forged or unusable Beam addresses and payment tokens through server-side validation.'],
    ['08','Audit history','Record authentication, payment, escrow, delivery, dispute, and confirmation events.'],
    ['09','Notifications','Surface request, approval, funding, delivery, release, dispute, and confirmation events in-app.'],
  ];
  return <><PageIntro eyebrow="Product features" title="Everything needed for a protected freelance payment." description="A focused workflow for requesting, approving, protecting, delivering, releasing, and confirming work payments in BEAM." /><section className="public-section features-grid">{features.map(([icon,title,text]) => <article key={title}><span>{icon}</span><h3>{title}</h3><p>{text}</p></article>)}</section><section className="public-section feature-detail"><div><p className="public-eyebrow">State-aware by design</p><h2>The right action only appears at the right time.</h2><p>Server-side lifecycle rules prevent duplicate approvals, premature delivery, unauthorized release, and repeated funding.</p></div><div className="status-flow"><span>Pending</span><i>-&gt;</i><span>Approved</span><i>-&gt;</i><span>Funded</span><i>-&gt;</i><span>Delivered</span><i>-&gt;</i><span>Paid</span></div></section></>;
}

function PricingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  return <><PageIntro eyebrow="Pricing preview" title="Start simple. Pay as the platform grows." description="WorkingBeam is currently an MVP. These plans communicate the intended product structure; automated billing is not active yet." /><section className="pricing-notice"><strong>Beta notice</strong><span>No platform subscription or automated fee collection is currently enabled.</span></section><section className="public-section pricing-grid">
    <article><p className="plan-name">Starter</p><h2>Free</h2><p>For individuals testing the workflow.</p><ul><li>Freelancer or client workspace</li><li>Payment requests</li><li>Mock wallet workflow</li><li>In-app activity</li></ul><PublicLink path="/auth?mode=register" onNavigate={onNavigate} className="public-secondary plan-action">Start in beta</PublicLink></article>
    <article className="featured-plan"><div className="plan-badge">PLANNED</div><p className="plan-name">Professional</p><h2>Usage based</h2><p>For active independent professionals.</p><ul><li>Everything in Starter</li><li>Live Beam Wallet API</li><li>Expanded transaction history</li><li>Priority workflow support</li></ul><PublicLink path="/contact" onNavigate={onNavigate} className="public-primary plan-action">Join the waitlist</PublicLink></article>
    <article><p className="plan-name">Teams</p><h2>Custom</h2><p>For organizations managing multiple contracts.</p><ul><li>Everything in Professional</li><li>Team roles and controls</li><li>Reporting and reconciliation</li><li>Deployment support</li></ul><PublicLink path="/contact" onNavigate={onNavigate} className="public-secondary plan-action">Contact us</PublicLink></article>
  </section></>;
}

function DocumentationPage() {
  return <><PageIntro eyebrow="Documentation" title="Understand the workflow before moving funds." description="A practical overview of accounts, payment states, wallet integration, configuration, and security boundaries." /><section className="public-section docs-layout"><aside><strong>On this page</strong><a href="#quick-start">Quick start</a><a href="#lifecycle">Payment lifecycle</a><a href="#wallet-api">Wallet API</a><a href="#security">Security</a></aside><div className="docs-content">
    <article id="quick-start"><p className="public-eyebrow">01 - Quick start</p><h2>Run the local workspace</h2><p>Install the root, server, and client dependencies; copy the server environment template; then start both services.</p><pre><code>npm install{`\n`}npm install --prefix server{`\n`}npm install --prefix client --legacy-peer-deps{`\n`}npm run dev</code></pre><p>The web app runs on port 3000 and the API runs on port 5000.</p></article>
    <article id="lifecycle"><p className="public-eyebrow">02 - Payment lifecycle</p><h2>Every transition is explicit</h2><div className="docs-lifecycle"><span>pending</span><i>-&gt;</i><span>approved</span><i>-&gt;</i><span>funding_pending</span><i>-&gt;</i><span>funded</span><i>-&gt;</i><span>work_submitted</span><i>-&gt;</i><span>release_pending</span><i>-&gt;</i><span>released</span></div><p>Funded and submitted payments can enter dispute. Failed wallet operations return the request to its previous actionable state.</p></article>
    <article id="wallet-api"><p className="public-eyebrow">03 - Wallet API</p><h2>Mock locally, validate live</h2><p>Development uses an explicit mock wallet. Production requires a TLS-protected Beam Wallet API endpoint and ACL key. Receiving addresses and tokens are checked with <code>validate_address</code> before use.</p><pre><code>BEAM_WALLET_API_URL=https://wallet.internal/api/wallet{`\n`}BEAM_WALLET_API_KEY=your-acl-key{`\n`}BEAM_ESCROW_ADDRESS=your-valid-token</code></pre></article>
    <article id="security"><p className="public-eyebrow">04 - Security</p><h2>Trust the server, not browser state</h2><p>WorkingBeam hashes passwords with scrypt, stores only session-token hashes, checks ownership and roles on every protected action, rate-limits requests, validates wallet inputs, and records audit events.</p><div className="docs-callout"><strong>Never provide a Beam seed phrase.</strong><span>WorkingBeam only needs a receiving address or payment token. Wallet credentials remain server-side.</span></div></article>
  </div></section></>;
}

function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', company: '', subject: 'product', message: '', website: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setStatus('sending'); setError('');
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to send message');
      setStatus('sent'); setForm({ name: '', email: '', company: '', subject: 'product', message: '', website: '' });
    } catch (caught) { setStatus('idle'); setError(caught instanceof Error ? caught.message : 'Unable to send message'); }
  };
  return <><PageIntro eyebrow="Contact" title="Tell us what you want to build or protect." description="Questions about the product, Beam integration, deployment, or the beta workflow are welcome." /><section className="public-section contact-layout"><div className="contact-details"><p className="public-eyebrow">Start a conversation</p><h2>We will route your message to the right place.</h2><p>Share enough context for us to understand whether you are evaluating WorkingBeam as a freelancer, client, team, or technical integrator.</p><div><span>Product and beta</span><strong>Product feedback, early access, and workflow questions</strong></div><div><span>Technical integration</span><strong>Beam Wallet API, deployment, and architecture</strong></div><div><span>Security</span><strong>Responsible disclosure and platform safeguards</strong></div></div><form className="contact-form" onSubmit={submit}><div className="contact-form-row"><label>Name<input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" /></label><label>Email<input required type="email" maxLength={160} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label></div><label>Company <small>(optional)</small><input maxLength={120} value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Company or project" /></label><label>Topic<select value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}><option value="product">Product and beta</option><option value="integration">Technical integration</option><option value="security">Security</option><option value="partnership">Partnership</option></select></label><label className="contact-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></label><label>Message<textarea required minLength={20} maxLength={2000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="How can we help?" /></label>{error && <div className="error-banner">{error}</div>}{status === 'sent' && <div className="success-banner">Thanks - your message has been received.</div>}<button className="public-primary contact-submit" disabled={status === 'sending'}>{status === 'sending' ? 'Sending...' : 'Send message'}</button></form></section></>;
}

export function PublicSite({ path, onNavigate }: { path: PublicPath; onNavigate: (path: string) => void }) {
  let page: ReactNode;
  if (path === '/about') page = <AboutPage />;
  else if (path === '/features') page = <FeaturesPage />;
  else if (path === '/pricing') page = <PricingPage onNavigate={onNavigate} />;
  else if (path === '/docs') page = <DocumentationPage />;
  else if (path === '/contact') page = <ContactPage />;
  else page = <LandingPage onNavigate={onNavigate} />;
  return <div className="public-site"><SiteHeader path={path} onNavigate={onNavigate} /><main>{page}</main><SiteFooter onNavigate={onNavigate} /></div>;
}
