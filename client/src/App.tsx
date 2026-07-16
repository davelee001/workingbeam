import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import './App.css';
import { TurnstileWidget } from './TurnstileWidget';

type Role = 'freelancer' | 'client';
type DashboardScreen = 'overview' | 'payments' | 'wallet';
type PaymentFilter = 'all' | 'active' | 'escrow' | 'completed' | 'disputed';
type PaymentStatus = 'pending' | 'approved' | 'funding_pending' | 'funded' | 'work_submitted' | 'release_pending' | 'released' | 'disputed' | 'cancelled';

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  walletAddress: string;
  emailVerified: boolean;
}

interface Transaction {
  id: string;
  kind: 'funding' | 'release' | 'refund';
  amountBeam: number;
  status: 'pending' | 'confirmed' | 'failed';
  walletTransactionId: string;
}

interface PaymentRequest {
  id: string;
  title: string;
  description: string;
  amountBeam: number;
  status: PaymentStatus;
  workNote?: string;
  disputeReason?: string;
  freelancer: User;
  client: User;
  freelancerId: string;
  clientId: string;
  transactions: Transaction[];
  createdAt: string;
}

interface AppNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const statusLabels: Record<PaymentStatus, string> = {
  pending: 'Awaiting approval', approved: 'Ready to fund', funding_pending: 'Funding confirmation',
  funded: 'Escrow funded', work_submitted: 'Work submitted', release_pending: 'Release confirmation',
  released: 'Paid', disputed: 'Disputed', cancelled: 'Cancelled',
};

class ApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new ApiError(payload.error ?? 'Request failed', payload.code);
  return payload as T;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User, token: string) => void }) {
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'freelancer' as Role, walletAddress: '', phone: '',
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!captchaToken) { setError('Complete the security challenge first.'); return; }
    setLoading(true);
    try {
      if (registering) {
        const result = await request<{ requiresVerification: true; email: string }>('/api/auth/register', undefined, {
          method: 'POST', body: JSON.stringify({ ...form, captchaToken }),
        });
        setVerificationEmail(result.email);
        setMessage(`We sent a six-digit verification code to ${result.email}.`);
      } else {
        const result = await request<{ user: User; token: string }>('/api/auth/login', undefined, {
          method: 'POST', body: JSON.stringify({ email: form.email, password: form.password, captchaToken }),
        });
        onAuthenticated(result.user, result.token);
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'EMAIL_UNVERIFIED') {
        setVerificationEmail(form.email.trim().toLowerCase());
        setMessage('Your account is waiting for email verification. Enter the code or request a new one.');
      } else setError(caught instanceof Error ? caught.message : 'Unable to continue');
    } finally {
      setLoading(false); setCaptchaToken(''); setCaptchaResetKey((key) => key + 1);
    }
  };

  const verifyEmail = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try {
      const result = await request<{ user: User; token: string }>('/api/auth/verify-email', undefined, {
        method: 'POST', body: JSON.stringify({ email: verificationEmail, code: verificationCode }),
      });
      onAuthenticated(result.user, result.token);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to verify email'); }
    finally { setLoading(false); }
  };

  const resendCode = async () => {
    setError(''); setMessage('');
    if (!captchaToken) { setError('Complete the security challenge before requesting a new code.'); return; }
    setLoading(true);
    try {
      await request('/api/auth/resend-verification', undefined, {
        method: 'POST', body: JSON.stringify({ email: verificationEmail, captchaToken }),
      });
      setMessage('A new verification code has been sent. It expires in 10 minutes.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to resend code'); }
    finally { setLoading(false); setCaptchaToken(''); setCaptchaResetKey((key) => key + 1); }
  };

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <a className="brand light" href="/">Working<span>Beam</span></a>
        <div className="hero-copy">
          <p className="eyebrow">Private freelance payments</p>
          <h1>Work delivered.<br />Payment protected.</h1>
          <p>Request work payments, fund escrow in BEAM, and release funds after delivery—with every step visible to both sides.</p>
        </div>
        <div className="trust-row"><span>Escrow workflow</span><span>Beam privacy</span><span>On-chain confirmation</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          {verificationEmail ? <>
            <p className="eyebrow dark">Secure your account</p>
            <h2>Verify your email</h2>
            <p className="muted">Enter the six-digit code sent to <strong>{verificationEmail}</strong>. Codes expire after 10 minutes.</p>
            <form onSubmit={verifyEmail}>
              <label>Verification code<input className="verification-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
              {message && <div className="success-banner">{message}</div>}
              {error && <div className="error-banner">{error}</div>}
              <button className="primary full" disabled={loading || verificationCode.length !== 6}>{loading ? 'Verifying…' : 'Verify and continue'}</button>
              <div className="resend-panel"><span>Need another code?</span><TurnstileWidget action="resend" resetKey={captchaResetKey} onToken={setCaptchaToken} /><button type="button" className="secondary full" disabled={loading || !captchaToken} onClick={() => void resendCode()}>Send a new code</button></div>
            </form>
            <p className="auth-switch"><button onClick={() => { setVerificationEmail(''); setVerificationCode(''); setCaptchaToken(''); setError(''); setMessage(''); setCaptchaResetKey((key) => key + 1); }}>Back to sign in</button></p>
          </> : <>
          <p className="eyebrow dark">{registering ? 'Create your workspace' : 'Welcome back'}</p>
          <h2>{registering ? 'Start with WorkingBeam' : 'Sign in to continue'}</h2>
          <p className="muted">{registering ? 'Your email and Beam receiving token are verified before the account is activated.' : 'Track escrow, delivery, and payment in one secure place.'}</p>
          <form onSubmit={submit}>
            {registering && <label>Full name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Amina Deng" /></label>}
            <label>Email address<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
            <label>Password<input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></label>
            {registering && <>
              <div className="role-picker">
                <button type="button" className={form.role === 'freelancer' ? 'selected' : ''} onClick={() => setForm({ ...form, role: 'freelancer' })}><strong>Freelancer</strong><small>Request and receive payments</small></button>
                <button type="button" className={form.role === 'client' ? 'selected' : ''} onClick={() => setForm({ ...form, role: 'client' })}><strong>Client</strong><small>Fund and release escrow</small></button>
              </div>
              <label>Beam wallet address or token<input required minLength={10} value={form.walletAddress} onChange={(e) => setForm({ ...form, walletAddress: e.target.value })} placeholder="Paste a real Beam address or payment token" /><small>Validated securely by the connected Beam Wallet API.</small></label>
              <label>Phone <small>(optional)</small><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+211 ..." /></label>
            </>}
            <TurnstileWidget action={registering ? 'register' : 'login'} resetKey={captchaResetKey} onToken={setCaptchaToken} />
            {error && <div className="error-banner">{error}</div>}
            <button className="primary full" disabled={loading || !captchaToken}>{loading ? 'Please wait…' : registering ? 'Create account securely' : 'Sign in securely'}</button>
          </form>
          <p className="auth-switch">{registering ? 'Already have an account?' : 'New to WorkingBeam?'} <button onClick={() => { setRegistering(!registering); setCaptchaToken(''); setCaptchaResetKey((key) => key + 1); setError(''); }}>{registering ? 'Sign in' : 'Create one'}</button></p>
          </>}
        </div>
      </section>
    </main>
  );
}

function PaymentCard({ payment, user, onAction }: {
  payment: PaymentRequest; user: User; onAction: (action: string, payment: PaymentRequest) => void;
}) {
  const pendingTransaction = payment.transactions.find((transaction) => transaction.status === 'pending');
  return (
    <article className="payment-card">
      <div className="payment-top">
        <div><span className={`status ${payment.status}`}>{statusLabels[payment.status]}</span><h3>{payment.title}</h3></div>
        <div className="amount"><strong>{payment.amountBeam.toLocaleString()}</strong><span>BEAM</span></div>
      </div>
      <p className="description">{payment.description || 'No additional description.'}</p>
      <div className="counterparty"><div className="avatar">{(user.role === 'client' ? payment.freelancer.name : payment.client.name).slice(0, 1)}</div><div><small>{user.role === 'client' ? 'Freelancer' : 'Client'}</small><strong>{user.role === 'client' ? payment.freelancer.name : payment.client.name}</strong></div></div>
      {payment.workNote && <div className="detail-note"><strong>Delivery</strong><p>{payment.workNote}</p></div>}
      {payment.disputeReason && <div className="detail-note danger"><strong>Dispute</strong><p>{payment.disputeReason}</p></div>}
      <div className="timeline">
        <span className="done">Requested</span><span className={payment.status !== 'pending' ? 'done' : ''}>Approved</span><span className={['funded','work_submitted','release_pending','released'].includes(payment.status) ? 'done' : ''}>Funded</span><span className={['work_submitted','release_pending','released'].includes(payment.status) ? 'done' : ''}>Delivered</span><span className={payment.status === 'released' ? 'done' : ''}>Paid</span>
      </div>
      <div className="card-actions">
        {user.role === 'client' && payment.status === 'pending' && <button className="primary" onClick={() => onAction('approve', payment)}>Approve request</button>}
        {user.role === 'client' && payment.status === 'approved' && <button className="primary" onClick={() => onAction('fund', payment)}>Fund escrow</button>}
        {user.role === 'freelancer' && payment.status === 'funded' && <button className="primary" onClick={() => onAction('submit-work', payment)}>Submit work</button>}
        {user.role === 'client' && payment.status === 'work_submitted' && <button className="primary" onClick={() => onAction('release', payment)}>Release payment</button>}
        {pendingTransaction && <button className="secondary" onClick={() => onAction(`refresh:${pendingTransaction.id}`, payment)}>Check confirmation</button>}
        {['funded','work_submitted'].includes(payment.status) && <button className="text-danger" onClick={() => onAction('dispute', payment)}>Open dispute</button>}
      </div>
      {payment.transactions.length > 0 && <div className="tx-list">{payment.transactions.map((transaction) => <div key={transaction.id}><span>{transaction.kind}</span><code>{transaction.walletTransactionId.slice(0, 18)}…</code><b className={transaction.status}>{transaction.status}</b></div>)}</div>}
    </article>
  );
}

function Dashboard({ initialUser, token, onLogout }: { initialUser: User; token: string; onLogout: () => void }) {
  const [payments, setPayments] = useState<PaymentRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [walletMode, setWalletMode] = useState('checking');
  const [screen, setScreen] = useState<DashboardScreen>('overview');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [form, setForm] = useState({ clientEmail: '', title: '', description: '', amountBeam: '', dueDate: '' });

  const load = useCallback(async () => {
    try {
      const [paymentData, notificationData, health] = await Promise.all([
        request<{ paymentRequests: PaymentRequest[] }>('/api/payment-requests', token),
        request<{ notifications: AppNotification[] }>('/api/notifications', token),
        request<{ wallet: { mode: string } }>('/api/health'),
      ]);
      setPayments(paymentData.paymentRequests); setNotifications(notificationData.notifications); setWalletMode(health.wallet.mode);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load dashboard'); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const mutate = async (key: string, path: string, body?: object) => {
    setBusy(key); setError('');
    try { await request(path, token, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed'); }
    finally { setBusy(''); }
  };

  const act = async (action: string, payment: PaymentRequest) => {
    if (action.startsWith('refresh:')) return mutate(action, `/api/transactions/${action.split(':')[1]}/refresh`);
    if (action === 'submit-work') {
      const workNote = window.prompt('Add a delivery note or link to the completed work:');
      if (workNote) await mutate(`${action}:${payment.id}`, `/api/payment-requests/${payment.id}/submit-work`, { workNote });
      return;
    }
    if (action === 'dispute') {
      const reason = window.prompt('Explain the dispute (at least 10 characters):');
      if (reason) await mutate(`${action}:${payment.id}`, `/api/payment-requests/${payment.id}/dispute`, { reason });
      return;
    }
    await mutate(`${action}:${payment.id}`, `/api/payment-requests/${payment.id}/${action}`);
  };

  const createPayment = async (event: FormEvent) => {
    event.preventDefault(); setBusy('create'); setError('');
    try {
      await request('/api/payment-requests', token, { method: 'POST', body: JSON.stringify({ ...form, amountBeam: Number(form.amountBeam) }) });
      setForm({ clientEmail: '', title: '', description: '', amountBeam: '', dueDate: '' }); setShowCreate(false); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create request'); }
    finally { setBusy(''); }
  };

  const total = payments.reduce((sum, item) => sum + item.amountBeam, 0);
  const secured = payments.filter((item) => ['funded','work_submitted','release_pending'].includes(item.status)).reduce((sum, item) => sum + item.amountBeam, 0);
  const paid = payments.filter((item) => item.status === 'released').reduce((sum, item) => sum + item.amountBeam, 0);
  const unread = notifications.filter((item) => !item.read).length;
  const transactions = payments.flatMap((payment) => payment.transactions.map((transaction) => ({ ...transaction, paymentTitle: payment.title })));
  const confirmedTransactions = transactions.filter((transaction) => transaction.status === 'confirmed');
  const filteredPayments = payments.filter((payment) => {
    if (paymentFilter === 'active') return !['released', 'disputed', 'cancelled'].includes(payment.status);
    if (paymentFilter === 'escrow') return ['funding_pending', 'funded', 'work_submitted', 'release_pending'].includes(payment.status);
    if (paymentFilter === 'completed') return payment.status === 'released';
    if (paymentFilter === 'disputed') return payment.status === 'disputed';
    return true;
  });

  const paymentGrid = (items: PaymentRequest[]) => (
    <section className="payments-grid">
      {items.length === 0 ? <div className="empty-state"><div>↗</div><h3>{payments.length === 0 ? 'No payment requests yet' : 'No requests match this filter'}</h3><p>{payments.length === 0 ? (initialUser.role === 'freelancer' ? 'Create your first request after agreeing on work with a client.' : 'Requests sent to your account will appear here.') : 'Try another payment status to see more activity.'}</p>{payments.length === 0 && initialUser.role === 'freelancer' && <button className="primary" onClick={() => setShowCreate(true)}>Create request</button>}</div> : items.map((payment) => <PaymentCard key={payment.id} payment={payment} user={initialUser} onAction={(action, item) => { if (!busy) void act(action, item); }} />)}
    </section>
  );

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <button className="brand brand-button" onClick={() => setScreen('overview')}>Working<span>Beam</span></button>
        <nav>
          <button className={screen === 'overview' ? 'active' : ''} onClick={() => setScreen('overview')}>Overview</button>
          <button className={screen === 'payments' ? 'active' : ''} onClick={() => setScreen('payments')}>Payments</button>
          <button className={screen === 'wallet' ? 'active' : ''} onClick={() => setScreen('wallet')}>Wallet</button>
        </nav>
        <div className="top-actions"><button className="notification-button" onClick={() => setShowNotifications(!showNotifications)}>◌{unread > 0 && <b>{unread}</b>}</button><div className="profile"><div className="avatar">{initialUser.name.slice(0, 1)}</div><div><strong>{initialUser.name}</strong><small>{initialUser.role}</small></div></div><button className="logout" onClick={() => setShowLogoutConfirm(true)}>Sign out</button></div>
      </header>
      {showNotifications && <aside className="notifications"><div className="aside-title"><h3>Notifications</h3><button onClick={() => setShowNotifications(false)}>×</button></div>{notifications.length === 0 ? <p className="empty">Nothing new yet.</p> : notifications.map((item) => <div className={item.read ? 'notice read' : 'notice'} key={item.id}><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>)}</aside>}
      <main className="dashboard">
        {error && <div className="error-banner dashboard-error">{error}</div>}

        {screen === 'overview' && <>
          <section className="welcome"><div><p className="eyebrow dark">{initialUser.role} workspace</p><h1>Good to see you, {initialUser.name.split(' ')[0]}.</h1><p>Here is what is happening with your work and payments.</p></div>{initialUser.role === 'freelancer' && <button className="primary" onClick={() => setShowCreate(true)}>+ New payment request</button>}</section>
          <section className="metrics">
            <div><small>Total requested</small><strong>{total.toLocaleString()} <em>BEAM</em></strong><span>Across {payments.length} request{payments.length === 1 ? '' : 's'}</span></div>
            <div><small>Protected in escrow</small><strong>{secured.toLocaleString()} <em>BEAM</em></strong><span className="positive">Funds secured</span></div>
            <div><small>{initialUser.role === 'freelancer' ? 'Total received' : 'Total released'}</small><strong>{paid.toLocaleString()} <em>BEAM</em></strong><span>Confirmed on chain</span></div>
            <div><small>Wallet connection</small><strong className="wallet-state"><i />{walletMode}</strong><span>{walletMode === 'mock' ? 'Local development mode' : 'Beam Wallet API'}</span></div>
          </section>
          <section className="section-heading"><div><h2>Payment activity</h2><p>Follow each request from approval to blockchain confirmation.</p></div><div className="heading-actions"><button className="secondary" onClick={() => void load()}>Refresh</button>{payments.length > 2 && <button className="secondary" onClick={() => setScreen('payments')}>View all</button>}</div></section>
          {paymentGrid(payments.slice(0, 4))}
        </>}

        {screen === 'payments' && <>
          <section className="screen-heading"><div><p className="eyebrow dark">Payment center</p><h1>Requests and escrow</h1><p>Manage approvals, delivery, disputes, and every on-chain confirmation.</p></div>{initialUser.role === 'freelancer' && <button className="primary" onClick={() => setShowCreate(true)}>+ New payment request</button>}</section>
          <section className="payment-overview">
            <div><span>All requests</span><strong>{payments.length}</strong></div>
            <div><span>Active</span><strong>{payments.filter((item) => !['released','disputed','cancelled'].includes(item.status)).length}</strong></div>
            <div><span>In escrow</span><strong>{secured.toLocaleString()} <small>BEAM</small></strong></div>
            <div><span>Completed</span><strong>{payments.filter((item) => item.status === 'released').length}</strong></div>
          </section>
          <section className="payments-toolbar">
            <div className="filter-tabs">{(['all','active','escrow','completed','disputed'] as PaymentFilter[]).map((filter) => <button key={filter} className={paymentFilter === filter ? 'active' : ''} onClick={() => setPaymentFilter(filter)}>{filter}</button>)}</div>
            <button className="secondary" onClick={() => void load()}>Refresh</button>
          </section>
          {paymentGrid(filteredPayments)}
        </>}

        {screen === 'wallet' && <>
          <section className="wallet-hero">
            <div><p className="eyebrow">Beam wallet</p><h1>Your private payment rail</h1><p>Escrow activity and blockchain confirmations connected to your WorkingBeam account.</p></div>
            <div className="connection-pill"><i />{walletMode === 'mock' ? 'Mock wallet connected' : 'Beam Wallet API connected'}</div>
          </section>
          <section className="wallet-layout">
            <div className="wallet-address-card">
              <div className="card-kicker">Receiving wallet</div>
              <h2>{initialUser.name}</h2>
              <p>Your freelancer releases and account transactions use this Beam address.</p>
              <div className="address-box"><code>{initialUser.walletAddress}</code><button onClick={() => void navigator.clipboard?.writeText(initialUser.walletAddress)}>Copy</button></div>
              <div className="wallet-badges"><span>Private by default</span><span>Account verified</span></div>
            </div>
            <div className="wallet-summary">
              <div><small>Protected now</small><strong>{secured.toLocaleString()} <em>BEAM</em></strong></div>
              <div><small>Confirmed volume</small><strong>{confirmedTransactions.reduce((sum, transaction) => sum + transaction.amountBeam, 0).toLocaleString()} <em>BEAM</em></strong></div>
              <div><small>Transactions</small><strong>{transactions.length}</strong></div>
            </div>
          </section>
          <section className="section-heading wallet-section-heading"><div><h2>Transaction history</h2><p>Funding and release activity reported by the Beam wallet connection.</p></div><button className="secondary" onClick={() => void load()}>Refresh</button></section>
          <section className={`transaction-table ${transactions.length === 0 ? 'is-empty' : ''}`}>
            {transactions.length === 0 ? <div className="wallet-empty"><span>◇</span><h3>No wallet activity yet</h3><p>Transactions will appear after a client funds the first approved request.</p><button className="secondary" onClick={() => setScreen('payments')}>Go to payments</button></div> : <>{transactions.map((transaction) => <div className="transaction-row" key={transaction.id}><div className={`tx-icon ${transaction.kind}`}>{transaction.kind === 'funding' ? '↓' : '↑'}</div><div><strong>{transaction.paymentTitle}</strong><span>{transaction.kind === 'funding' ? 'Escrow funding' : 'Freelancer release'}</span></div><code>{transaction.walletTransactionId.slice(0, 20)}…</code><strong>{transaction.amountBeam.toLocaleString()} BEAM</strong><b className={transaction.status}>{transaction.status}</b></div>)}</>}
          </section>
          <section className="wallet-security"><div>✓</div><div><h3>Wallet security</h3><p>WorkingBeam never asks for your Beam seed phrase. Live wallet credentials remain server-side and should be protected with TLS, ACL, and IP allowlisting.</p></div></section>
        </>}
      </main>
      {showLogoutConfirm && <div className="modal-backdrop" onMouseDown={() => setShowLogoutConfirm(false)}><section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="signout-title" onMouseDown={(event) => event.stopPropagation()}><div className="confirm-icon">↗</div><h2 id="signout-title">Are you sure you want to sign out?</h2><p>Your current session will end. You can sign back in at any time.</p><div className="confirm-actions"><button className="secondary" onClick={() => setShowLogoutConfirm(false)}>Cancel</button><button className="signout-confirm" onClick={onLogout}>Sign out</button></div></section></div>}
      {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><section className="modal" onMouseDown={(event) => event.stopPropagation()}><div className="aside-title"><div><p className="eyebrow dark">New request</p><h2>Request a payment</h2></div><button onClick={() => setShowCreate(false)}>×</button></div><form onSubmit={createPayment}><label>Client email<input type="email" required value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} placeholder="client@example.com" /></label><label>Project or milestone<input required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Landing page design" /></label><label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is included in this payment?" /></label><div className="form-row"><label>Amount (BEAM)<input type="number" required min="0.00000001" step="0.00000001" value={form.amountBeam} onChange={(e) => setForm({ ...form, amountBeam: e.target.value })} /></label><label>Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label></div><button className="primary full" disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Send payment request'}</button></form></section></div>}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('workingbeam_token') ?? '');
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(token));

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    request<{ user: User }>('/api/auth/me', token).then((result) => setUser(result.user)).catch(() => {
      localStorage.removeItem('workingbeam_token'); setToken('');
    }).finally(() => setChecking(false));
  }, [token]);

  const authenticated = (nextUser: User, nextToken: string) => {
    localStorage.setItem('workingbeam_token', nextToken); setUser(nextUser); setToken(nextToken);
  };
  const logout = () => {
    void request('/api/auth/logout', token, { method: 'POST' }).catch(() => undefined);
    localStorage.removeItem('workingbeam_token'); setToken(''); setUser(null);
  };
  if (checking) return <div className="loading-screen"><div className="brand">Working<span>Beam</span></div><i /></div>;
  return user && token ? <Dashboard initialUser={user} token={token} onLogout={logout} /> : <AuthScreen onAuthenticated={authenticated} />;
}

export default App;
