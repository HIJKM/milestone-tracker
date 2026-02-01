
import { Router, Request, Response } from 'express';
import passport from '../config/passport.js';
import { PrismaClient } from '@prisma/client';
import { generateTokens, verifyRefreshToken } from '../utils/jwt.js';

const router = Router();
const prisma = new PrismaClient();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const DEV_MODE = process.env.NODE_ENV !== 'production' && process.env.DEV_MODE === 'true';

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
      });

      res.redirect(`${CLIENT_URL}?token=${accessToken}`);
    } catch (error) {
      console.error('Dev login error:', error);
      res.status(500).json({ error: 'Dev login failed' });
    }
  });
}

router.get( // client.ts의 googleLogin()에서 보내온 요청.
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }) // Google 로그인 페이지로 리다이렉트
);

router.get( // Google Login 후 콜백.
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_URL}/login?error=google_failed`,
    session: false,
  }),
  (req: Request, res: Response) => {
    if (!req.user) { // user가 없는 경우 로그인 에러 페이지로 리다이렉트
      return res.redirect(`${CLIENT_URL}/login?error=no_user`);
    }
    console.log('✅ Google callback 실행됨');                              
    console.log('req.user:', req.user);  // 사용자 정보 있나?  

    const { accessToken, refreshToken } = generateTokens(req.user as any);
    console.log('🍪 refreshToken 생성됨:', refreshToken?.substring(0, 20) + '...'); 

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true, // Access with javascript code is not available
      secure: true, // Https only, not http.
      sameSite: 'lax', // 페이지 내 링크의 쿠키 요청 허용
      maxAge: 7 * 24 * 60 * 60 * 1000, // A week
      path: '/',
    });
    console.log('쿠키 설정 완료');

    res.redirect(`${CLIENT_URL}?token=${accessToken}`);
    console.log('리다이렉트 시도');
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
    });

    res.redirect(`${CLIENT_URL}?token=${accessToken}`);
  }
);
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return res.json({ user: null });
    }

    const { verifyToken } = await import('../utils/jwt.js');
    const payload = verifyToken(token);

    if (!payload) {
      return res.json({ user: null });
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
  });

  res.json({ success: true });
});

export default router;
