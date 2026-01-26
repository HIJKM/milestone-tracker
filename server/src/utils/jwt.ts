import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

if (!JWT_SECRET) {
  throw new Error('❌ JWT_SECRET environment variable is not set. This is required for security.');
}

if (!REFRESH_SECRET) {
  throw new Error('❌ REFRESH_SECRET environment variable is not set. This is required for security.');
}

// Access Token: 15분 (단기)
const ACCESS_TOKEN_EXPIRY = '15m';

// Refresh Token: 7일 (장기)
const REFRESH_TOKEN_EXPIRY = '7d';

export interface AccessTokenPayload {
  id: string;
  email: string;
}

export interface RefreshTokenPayload {
  id: string;
}

/**
 * Access Token 생성 (15분 유효)
 * XSS 공격 시 피해 범위를 제한하기 위해 짧은 만료시간 설정
 */
export function generateAccessToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    } as AccessTokenPayload,
    JWT_SECRET as string,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Refresh Token 생성 (7일 유효)
 * httpOnly 쿠키에 저장되므로 XSS로부터 보호됨
 */
export function generateRefreshToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
    } as RefreshTokenPayload,
    REFRESH_SECRET as string,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

/**
 * 두 토큰 모두 생성
 */
export function generateTokens(user: User) {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
}

/**
 * Access Token 검증
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as AccessTokenPayload;
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Refresh Token 검증
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const payload = jwt.verify(token, REFRESH_SECRET as string) as RefreshTokenPayload;
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * 하위 호환성: 기존 generateToken/verifyToken은 유지
 */
export function generateToken(user: User): string {
  return generateAccessToken(user);
}

export function verifyToken(token: string): AccessTokenPayload | null {
  return verifyAccessToken(token);
}
