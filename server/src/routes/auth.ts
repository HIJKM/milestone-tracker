import { Router, Request, Response } from 'express';
import passport from '../config/passport.js';
import { PrismaClient } from '@prisma/client';
import { generateTokens, verifyRefreshToken } from '../utils/jwt.js';

const router = Router();
const prisma = new PrismaClient();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const DEV_MODE = process.env.NODE_ENV !== 'production' && process.env.DEV_MODE === 'true';

// Dev mode auto-login (no OAuth required)
if (DEV_MODE) {
  router.get('/dev-login', async (req: Request, res: Response) => {
    try {
      // Find or create dev user
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

      // Generate both tokens
      const { accessToken, refreshToken } = generateTokens(user);

      // Save refresh token to httpOnly cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect with short-lived access token in URL (15분)
      res.redirect(`${CLIENT_URL}?token=${accessToken}`);
    } catch (error) {
      console.error('Dev login error:', error);
      res.status(500).json({ error: 'Dev login failed' });
    }
  });
}

// Google OAuth
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_URL}/login?error=google_failed`,
    session: false, // Disable session for JWT
  }),
  (req: Request, res: Response) => {
    if (!req.user) {
      return res.redirect(`${CLIENT_URL}/login?error=no_user`);
    }

    // Generate both tokens
    const { accessToken, refreshToken } = generateTokens(req.user as any);

    // Save refresh token to httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect with short-lived access token in URL (15분)
    res.redirect(`${CLIENT_URL}?token=${accessToken}`);
  }
);

// GitHub OAuth
router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${CLIENT_URL}/login?error=github_failed`,
    session: false, // Disable session for JWT
  }),
  (req: Request, res: Response) => {
    if (!req.user) {
      return res.redirect(`${CLIENT_URL}/login?error=no_user`);
    }

    // Generate both tokens
    const { accessToken, refreshToken } = generateTokens(req.user as any);

    // Save refresh token to httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect with short-lived access token in URL (15분)
    res.redirect(`${CLIENT_URL}?token=${accessToken}`);
  }
);

// Get current user (JWT-based, public endpoint)
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return res.json({ user: null });
    }

    // Verify token and get user
    const { verifyToken } = await import('../utils/jwt.js');
    const payload = verifyToken(token);

    if (!payload) {
      return res.json({ user: null });
    }

    // Fetch full user data
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    res.json({ user });
  } catch (error) {
    res.json({ user: null });
  }
});

// Refresh access token using refresh token from cookie
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new access token
    const { accessToken } = generateTokens(user);

    // Return new access token
    res.json({ accessToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});

// Logout (JWT doesn't require backend logout, just client-side token deletion)
router.post('/logout', (req: Request, res: Response) => {
  // Clear refresh token cookie
  res.clearCookie('refreshToken');
  res.json({ success: true });
});

export default router;
