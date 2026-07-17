import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import cors from 'cors';
import { PublicUser } from './domain/types.js';
import { PlatformError, PlatformService } from './services/platformService.js';

type AuthenticatedRequest = Request & { user?: PublicUser; token?: string };

function asyncRoute(handler: (req: AuthenticatedRequest, res: Response) => Promise<void> | void): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req as AuthenticatedRequest, res)).catch(next);
}

function bearerToken(req: Request): string | undefined {
  const authorization = req.header('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
}

function rateLimiter(windowMs = 60_000, maximum = 120): RequestHandler {
  const requests = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = requests.get(key);
    const timestamp = Date.now();
    if (!current || current.resetAt <= timestamp) {
      requests.set(key, { count: 1, resetAt: timestamp + windowMs });
      next(); return;
    }
    current.count += 1;
    if (current.count > maximum) {
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' }); return;
    }
    next();
  };
}

export function createApp(platform: PlatformService, persistenceMode = 'json') {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY === 'true');
  app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? true }));
  app.use(express.json({ limit: '64kb' }));
  app.use(rateLimiter());
  const authLimiter = rateLimiter(15 * 60_000, 20);
  const verificationLimiter = rateLimiter(15 * 60_000, 12);
  const contactLimiter = rateLimiter(60 * 60_000, 8);

  const authenticate: RequestHandler = (req, _res, next) => {
    try {
      const token = bearerToken(req);
      const authenticated = req as AuthenticatedRequest;
      authenticated.user = platform.authenticate(token);
      authenticated.token = token;
      next();
    } catch (error) {
      next(error);
    }
  };

  app.get('/api/health', asyncRoute(async (_req, res) => {
    const [wallet, email] = await Promise.all([platform.walletHealth(), platform.emailHealth()]);
    res.json({ status: 'ok', service: 'WorkingBeam API', database: { mode: persistenceMode }, wallet, email });
  }));

  app.get('/health', asyncRoute(async (_req, res) => {
    const [wallet, email] = await Promise.all([platform.walletHealth(), platform.emailHealth()]);
    res.json({ status: 'ok', service: 'WorkingBeam API', database: { mode: persistenceMode }, wallet, email });
  }));

  app.get('/api', (_req, res) => {
    res.json({
      service: 'WorkingBeam API',
      status: 'ok',
      public: [
        'GET /api',
        'GET /api/health',
        'POST /api/contact',
        'POST /api/auth/register',
        'POST /api/auth/login',
      ],
      authenticated: [
        'GET /api/auth/me',
        'PATCH /api/auth/me',
        'POST /api/auth/logout',
        'GET /api/payment-requests',
        'POST /api/payment-requests',
        'POST /api/wallet/generate',
        'GET /api/wallet/deposit-address',
        'GET /api/wallet/transactions',
        'POST /api/wallet/send',
        'GET /api/notifications',
      ],
    });
  });

  app.post('/api/contact', contactLimiter, asyncRoute((req, res) => {
    platform.createContactInquiry(req.body ?? {});
    res.status(201).json({ received: true });
  }));

  app.post('/api/auth/register', authLimiter, asyncRoute(async (req, res) => {
    res.status(201).json(await platform.register(req.body ?? {}));
  }));

  app.post('/api/auth/verify-email', verificationLimiter, asyncRoute(async (req, res) => {
    res.json(await platform.verifyEmail(req.body?.email, req.body?.code));
  }));

  app.post('/api/auth/resend-verification', verificationLimiter, asyncRoute(async (req, res) => {
    res.json(await platform.resendEmailVerification(req.body?.email));
  }));

  app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
    res.json(await platform.login(req.body?.email, req.body?.password));
  }));

  app.post('/api/auth/logout', authenticate, asyncRoute((req, res) => {
    platform.logout(req.token as string);
    res.status(204).send();
  }));

  app.get('/api/auth/me', authenticate, asyncRoute((req, res) => {
    res.json({ user: req.user });
  }));

  app.patch('/api/auth/me', authenticate, asyncRoute(async (req, res) => {
    res.json({ user: await platform.updateProfile(req.user as PublicUser, req.body ?? {}) });
  }));

  app.post('/api/wallet/generate', authenticate, asyncRoute(async (req, res) => {
    res.json(await platform.generateWallet(req.user as PublicUser));
  }));

  app.get('/api/wallet/deposit-address', authenticate, asyncRoute((req, res) => {
    res.json(platform.depositAddress(req.user as PublicUser));
  }));

  app.get('/api/wallet/transactions', authenticate, asyncRoute((req, res) => {
    res.json({ transactions: platform.listWalletTransactions(req.user as PublicUser) });
  }));

  app.post('/api/wallet/send', authenticate, asyncRoute(async (req, res) => {
    res.status(201).json(await platform.sendPayment(req.user as PublicUser, req.body ?? {}));
  }));

  app.get('/api/payment-requests', authenticate, asyncRoute((req, res) => {
    res.json({ paymentRequests: platform.listPaymentRequests(req.user as PublicUser) });
  }));

  app.post('/api/payment-requests', authenticate, asyncRoute((req, res) => {
    res.status(201).json({ paymentRequest: platform.createPaymentRequest(req.user as PublicUser, req.body ?? {}) });
  }));

  app.get('/api/payment-requests/:id', authenticate, asyncRoute((req, res) => {
    res.json({ paymentRequest: platform.paymentView(req.params.id, req.user as PublicUser) });
  }));

  app.post('/api/payment-requests/:id/approve', authenticate, asyncRoute((req, res) => {
    res.json({ paymentRequest: platform.approvePayment(req.user as PublicUser, req.params.id) });
  }));

  app.post('/api/payment-requests/:id/fund', authenticate, asyncRoute(async (req, res) => {
    res.json({ paymentRequest: await platform.fundEscrow(req.user as PublicUser, req.params.id) });
  }));

  app.post('/api/payment-requests/:id/submit-work', authenticate, asyncRoute((req, res) => {
    res.json({ paymentRequest: platform.submitWork(req.user as PublicUser, req.params.id, req.body?.workNote) });
  }));

  app.post('/api/payment-requests/:id/release', authenticate, asyncRoute(async (req, res) => {
    res.json({ paymentRequest: await platform.releaseEscrow(req.user as PublicUser, req.params.id) });
  }));

  app.post('/api/payment-requests/:id/dispute', authenticate, asyncRoute((req, res) => {
    res.json({ paymentRequest: platform.dispute(req.user as PublicUser, req.params.id, req.body?.reason) });
  }));

  app.post('/api/transactions/:id/refresh', authenticate, asyncRoute(async (req, res) => {
    res.json({ paymentRequest: await platform.refreshTransaction(req.user as PublicUser, req.params.id) });
  }));

  app.get('/api/notifications', authenticate, asyncRoute((req, res) => {
    res.json({ notifications: platform.listNotifications(req.user as PublicUser) });
  }));

  app.post('/api/notifications/:id/read', authenticate, asyncRoute((req, res) => {
    res.json({ notification: platform.markNotificationRead(req.user as PublicUser, req.params.id) });
  }));

  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof PlatformError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code }); return;
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
