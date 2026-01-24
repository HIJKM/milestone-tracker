import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Serialize user to session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const existingUser = await prisma.user.findUnique({
            where: {
              provider_providerId: {
                provider: 'google',
                providerId: profile.id,
              },
            },
          });

          if (existingUser) {
            return done(null, existingUser);
          }

          const newUser = await prisma.user.create({
            data: {
              email: profile.emails?.[0]?.value || '',
              name: profile.displayName,
              image: profile.photos?.[0]?.value,
              provider: 'google',
              providerId: profile.id,
            },
          });

          done(null, newUser);
        } catch (error) {
          done(error as Error, undefined);
        }
      }
    )
  );
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: '/auth/github/callback',
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: any,
        done: (error: any, user?: any) => void
      ) => {
        try {
          const existingUser = await prisma.user.findUnique({
            where: {
              provider_providerId: {
                provider: 'github',
                providerId: profile.id,
              },
            },
          });

          if (existingUser) {
            return done(null, existingUser);
          }

          const newUser = await prisma.user.create({
            data: {
              email: profile.emails?.[0]?.value || `${profile.username}@github.local`,
              name: profile.displayName || profile.username,
              image: profile.photos?.[0]?.value,
              provider: 'github',
              providerId: profile.id,
            },
          });

          done(null, newUser);
        } catch (error) {
          done(error);
        }
      }
    )
  );
}

export default passport;
