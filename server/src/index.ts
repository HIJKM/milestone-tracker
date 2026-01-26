import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import passport from './config/passport.js';
import authRoutes from './routes/auth.js';
import milestoneRoutes from './routes/milestones.js';

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Trust proxy - for OAuth callback URLs behind reverse proxy (Railway)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax', // Safari 호환성을 위해 'lax' 사용
    },
  })
);

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/api/milestones', milestoneRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
