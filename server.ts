import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  verifyFirebaseIdToken,
  getDailySearchUsage,
  incrementDailySearch,
  searchPlacesText,
  checkWebsiteHealth,
  generateOutreachProposal,
  ESTIMATED_COST_PER_SEARCH_USD,
  COST_LABEL
} from './src/server/leadFinderCore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());

async function authenticateLeadFinderRequest(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(404).json({ error: 'Route not found' });
  }

  const idToken = authHeader.substring(7);
  try {
    const verifiedUser = await verifyFirebaseIdToken(idToken);
    (req as any).user = verifiedUser;
    next();
  } catch (err: any) {
    return res.status(404).json({ error: 'Route not found' });
  }
}

app.get('/api/lead-finder/usage', authenticateLeadFinderRequest, (req, res) => {
  const usage = getDailySearchUsage();
  res.json({
    ...usage,
    estimatedCostPerSearchUsd: ESTIMATED_COST_PER_SEARCH_USD,
    costLabel: COST_LABEL
  });
});

app.post('/api/lead-finder/search', authenticateLeadFinderRequest, async (req, res) => {
  const { query, city, state, category } = req.body || {};
  const allowed = incrementDailySearch();
  if (!allowed) {
    return res.status(429).json({ error: 'Daily search cap reached (default: 20 searches/day)' });
  }

  try {
    const results = await searchPlacesText({ query, city, state, category });
    const usage = getDailySearchUsage();
    res.json({
      results,
      usage,
      estimatedCostPerSearchUsd: ESTIMATED_COST_PER_SEARCH_USD,
      costLabel: COST_LABEL
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Places API search error' });
  }
});

app.post('/api/lead-finder/health-check', authenticateLeadFinderRequest, async (req, res) => {
  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const health = await checkWebsiteHealth(url);
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Health check failed' });
  }
});

app.post('/api/lead-finder/outreach', authenticateLeadFinderRequest, async (req, res) => {
  const { business } = req.body || {};
  if (!business || !business.name) {
    return res.status(400).json({ error: 'Invalid business payload' });
  }

  try {
    const outreachMessage = await generateOutreachProposal(business);
    res.json({ message: outreachMessage });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Outreach generation failed' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    // Server running
  });
}

startServer();
