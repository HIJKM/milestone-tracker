
import { Router, Request, Response } from 'express';
import passport from '../config/passport.js';
import { PrismaClient } from '@prisma/client';
import { generateTokens, verifyRefreshToken } from '../utils/jwt.js';

const router = Router();
const prisma = new PrismaClient();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const DEV_MODE = process.env.NODE_ENV !== 'production' && process.env.DEV_MODE === 'true';
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : 'localhost';

if (DEV_MODE) {
  router.get('/dev-login', async (req: Request, res: Response) => {
    try {
      let user = await prisma.user.findFirst({
        where: { provider: 'dev' }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email: 'dev@localhost',
            name: 'Dev User',
            provider: 'dev',
            providerId: 'dev-user-001',
          }
        });
      }

      const { accessToken, refreshToken } = generateTokens(user);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
        domain: COOKIE_DOMAIN
      });

      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
        domain: COOKIE_DOMAIN
      });

      res.redirect(`${CLIENT_URL}`);
    } catch (error) {
      console.error('Dev login error:', error);
      res.status(500).json({ error: 'Dev login failed' });
    }
  });
}

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_URL}/login?error=google_failed`,
    session: false,
  }),
  (req: Request, res: Response) => {
    if (!req.user) {
      return res.redirect(`${CLIENT_URL}/login?error=no_user`);
    }

    const { accessToken, refreshToken } = generateTokens(req.user as any);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      domain: COOKIE_DOMAIN
    });

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
      domain: COOKIE_DOMAIN
    });

    res.redirect(`${CLIENT_URL}`);
  }
);

router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${CLIENT_URL}/login?error=github_failed`,
    session: false,
  }),
  (req: Request, res: Response) => {
    if (!req.user) {
      return res.redirect(`${CLIENT_URL}/login?error=no_user`);
    }

    const { accessToken, refreshToken } = generateTokens(req.user as any);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      domain: COOKIE_DOMAIN
    });

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
      domain: COOKIE_DOMAIN
    });

    res.redirect(`${CLIENT_URL}`);
  }
);
router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'No token' });
    }

    const { verifyToken } = await import('../utils/jwt.js');
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    res.json({ user });
  } catch (error) {
    res.json({ user: null });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { accessToken } = generateTokens(user);

    res.json({ accessToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    domain: COOKIE_DOMAIN
  });

  res.json({ success: true });
});

export default router;
