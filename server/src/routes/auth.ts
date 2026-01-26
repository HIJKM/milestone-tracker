import { Router, Request, Response } from 'express';
import passport from '../config/passport.js';
import { PrismaClient } from '@prisma/client';
import { generateToken } from '../utils/jwt.js';

const router = Router();
const prisma = new PrismaClient();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const DEV_MODE = process.env.DEV_MODE === 'true';

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

      // Log in the user
      req.login(user, (err: Error | null) => {
        if (err) {
          return res.status(500).json({ error: 'Login failed' });
        }
        res.redirect(CLIENT_URL);
      });
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
    const token = generateToken(req.user as any);
    res.redirect(`${CLIENT_URL}?token=${token}`);
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
    const token = generateToken(req.user as any);
    res.redirect(`${CLIENT_URL}?token=${token}`);
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

// Logout (JWT doesn't require backend logout, just client-side token deletion)
router.post('/logout', (req: Request, res: Response) => {
  // With JWT, logout is handled client-side by deleting the token
  res.json({ success: true });
});

export default router;
