import {
  verifyFirebaseIdToken,
  getDailySearchUsage,
  incrementDailySearch,
  searchPlacesText,
  checkWebsiteHealth,
  generateOutreachProposal,
  ESTIMATED_COST_PER_SEARCH_USD,
  COST_LABEL
} from '../../src/server/leadFinderCore.js';

export async function handler(event: {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Route not found' })
    };
  }

  const idToken = authHeader.substring(7);
  try {
    await verifyFirebaseIdToken(idToken);
  } catch (err: any) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Route not found' })
    };
  }

  const subPath = event.path.replace(/^\/\.netlify\/functions\/lead-finder/, '').replace(/^\/api\/lead-finder/, '');
  const body = event.body ? JSON.parse(event.body) : {};

  if (event.httpMethod === 'GET' && (subPath === '/usage' || subPath === '')) {
    const usage = getDailySearchUsage();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...usage,
        estimatedCostPerSearchUsd: ESTIMATED_COST_PER_SEARCH_USD,
        costLabel: COST_LABEL
      })
    };
  }

  if (event.httpMethod === 'POST' && subPath === '/search') {
    const allowed = incrementDailySearch();
    if (!allowed) {
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Daily search cap reached' })
      };
    }

    try {
      const results = await searchPlacesText(body);
      const usage = getDailySearchUsage();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results,
          usage,
          estimatedCostPerSearchUsd: ESTIMATED_COST_PER_SEARCH_USD,
          costLabel: COST_LABEL
        })
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message || 'Places API error' })
      };
    }
  }

  if (event.httpMethod === 'POST' && subPath === '/health-check') {
    try {
      const health = await checkWebsiteHealth(body.url);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(health)
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message || 'Health check error' })
      };
    }
  }

  if (event.httpMethod === 'POST' && subPath === '/outreach') {
    try {
      const message = await generateOutreachProposal(body.business);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      };
    } catch (err: any) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message || 'Outreach generation error' })
      };
    }
  }

  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Route not found' })
  };
}
