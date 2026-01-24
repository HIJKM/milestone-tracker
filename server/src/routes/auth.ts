import { Router, Request, Response } from 'express';
import passport from '../config/passport.js';
import { PrismaClient } from '@prisma/client';

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
  }),
  (req, res) => {
    res.redirect(CLIENT_URL);
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
  }),
  (req, res) => {
    res.redirect(CLIENT_URL);
  }
);

// Get current user
router.get('/me', (req: Request, res: Response) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.json({ user: null });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session destruction failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

export default router;
