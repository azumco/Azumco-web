import crypto from 'crypto';
import dns from 'dns';

export const ESTIMATED_COST_PER_SEARCH_USD = 0.035;
export const COST_LABEL = '[UNVERIFIED - CHECK GOOGLE CLOUD BILLING TARIFFS]';
export const DAILY_SEARCH_CAP_DEFAULT = 20;

let jwksCache: { keys: any[]; expiresAt: number } | null = null;

const dailySearchCounter = new Map<string, number>();

export function getDailySearchUsage(): { date: string; count: number; cap: number; remaining: number } {
  const today = new Date().toISOString().split('T')[0];
  const cap = parseInt(process.env.LEAD_FINDER_DAILY_CAP || String(DAILY_SEARCH_CAP_DEFAULT), 10);
  const count = dailySearchCounter.get(today) || 0;
  return {
    date: today,
    count,
    cap,
    remaining: Math.max(0, cap - count)
  };
}

export function incrementDailySearch(): boolean {
  const usage = getDailySearchUsage();
  if (usage.count >= usage.cap) {
    return false;
  }
  dailySearchCounter.set(usage.date, usage.count + 1);
  return true;
}

async function getGooglePublicJwks(): Promise<any[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }

  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!res.ok) {
    throw new Error(`Failed to fetch Google JWKS: ${res.statusText}`);
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const ttlSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;

  const data = await res.json() as { keys: any[] };
  jwksCache = {
    keys: data.keys || [],
    expiresAt: now + (ttlSeconds * 1000)
  };
  return jwksCache.keys;
}

export interface VerifiedAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedAuthUser> {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('Server configuration error: FIREBASE_PROJECT_ID is not set in environment.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token structure');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
  const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');

  const header = JSON.parse(headerJson);
  const payload = JSON.parse(payloadJson);

  if (header.alg !== 'RS256') {
    throw new Error('Unsupported JWT algorithm; expected RS256');
  }

  const keys = await getGooglePublicJwks();
  const jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) {
    throw new Error('Matching public key not found for token kid');
  }

  const publicKey = crypto.createPublicKey({
    key: jwk,
    format: 'jwk'
  });

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  const signatureBuffer = Buffer.from(signatureB64, 'base64url');
  const isValid = verifier.verify(publicKey, signatureBuffer);

  if (!isValid) {
    throw new Error('Invalid JWT cryptographic signature');
  }

  const nowSec = Math.floor(Date.now() / 1000);

  if (!payload.exp || payload.exp < nowSec) {
    throw new Error('Token has expired');
  }

  if (payload.iat && payload.iat > nowSec + 300) {
    throw new Error('Token issued in future');
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Token issuer mismatch: expected ${expectedIssuer}, received ${payload.iss}`);
  }

  if (payload.aud !== projectId) {
    throw new Error(`Token audience mismatch: expected ${projectId}, received ${payload.aud}`);
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Token sub claim is missing or invalid');
  }

  if (payload.email_verified !== true) {
    throw new Error('Authentication rejected: Google account email must be verified');
  }

  const allowedEmail = (process.env.ALLOWED_EMAIL || process.env.LEAD_FINDER_ALLOWED_EMAIL || '').trim().toLowerCase();
  if (!allowedEmail) {
    throw new Error('Server configuration error: ALLOWED_EMAIL is not set in environment.');
  }

  const userEmail = (payload.email || '').trim().toLowerCase();
  if (userEmail !== allowedEmail) {
    throw new Error('Access denied: Email not present on the authorized administrative allowlist');
  }

  return {
    uid: payload.sub,
    email: userEmail,
    emailVerified: true,
    name: payload.name
  };
}

export function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return true;

  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every(p => !isNaN(p))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // Link-local / Cloud metadata
    if (parts[0] === 127) return true; // Loopback
    if (parts[0] === 0) return true;
  }

  const lowerIp = ip.toLowerCase();
  if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true; // Unique local
  if (lowerIp.startsWith('fe80')) return true; // Link-local IPv6

  return false;
}

export async function checkWebsiteHealth(targetUrl: string): Promise<{
  isValid: boolean;
  status?: number;
  responseTimeMs?: number;
  finalUrl?: string;
  hasMobileViewport?: boolean;
  hasSsl?: boolean;
  error?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { isValid: false, error: 'Malformed URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, error: 'Disallowed protocol; only http/https supported' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'metadata.google.internal') {
    return { isValid: false, error: 'Access to private internal host forbidden' };
  }

  try {
    const lookupResult = await dns.promises.lookup(hostname, { all: true });
    for (const address of lookupResult) {
      if (isPrivateIp(address.address)) {
        return { isValid: false, error: `Resolved host points to forbidden private IP: ${address.address}` };
      }
    }
  } catch (dnsErr: any) {
    return { isValid: false, error: `DNS resolution failed: ${dnsErr?.message || 'Host not found'}` };
  }

  const startTime = Date.now();
  let currentUrl = targetUrl;
  let redirectsCount = 0;
  const maxRedirects = 3;

  while (redirectsCount <= maxRedirects) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        },
        redirect: 'manual',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const responseTimeMs = Date.now() - startTime;
      const status = response.status;

      if ([301, 302, 303, 307, 308].includes(status)) {
        redirectsCount++;
        const location = response.headers.get('location');
        if (!location) {
          return { isValid: true, status, responseTimeMs, finalUrl: currentUrl, hasSsl: currentUrl.startsWith('https://') };
        }
        const nextUrl = new URL(location, currentUrl);
        if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
          return { isValid: false, error: 'Redirected to illegal protocol' };
        }
        currentUrl = nextUrl.toString();
        continue;
      }

      let hasMobileViewport = false;
      try {
        const bodyText = await response.text();
        hasMobileViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(bodyText);
      } catch {
        // body reading failed or not html
      }

      return {
        isValid: status >= 200 && status < 400,
        status,
        responseTimeMs,
        finalUrl: currentUrl,
        hasMobileViewport,
        hasSsl: currentUrl.startsWith('https://')
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { isValid: false, error: 'Request timed out after 5000ms' };
      }
      return { isValid: false, error: err.message || 'Connection failed' };
    }
  }

  return { isValid: false, error: 'Exceeded maximum redirect limit (3 hops)' };
}

export interface PlacesSearchParams {
  query: string;
  city?: string;
  state?: string;
  category?: string;
}

export async function searchPlacesText(params: PlacesSearchParams): Promise<any[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('Server configuration error: GOOGLE_PLACES_API_KEY is not configured.');
  }

  const queryParts = [params.query];
  if (params.category) queryParts.push(params.category);
  if (params.city) queryParts.push(params.city);
  if (params.state) queryParts.push(params.state);
  const textQuery = queryParts.filter(Boolean).join(' ').trim();

  if (!textQuery) {
    throw new Error('Search query is empty');
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.types',
    'places.googleMapsUri',
    'places.rating',
    'places.userRatingCount',
    'places.websiteUri',
    'places.nationalPhoneNumber'
  ].join(',');

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask
    },
    body: JSON.stringify({
      textQuery,
      pageSize: 15
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places API returned error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawPlaces = data.places || [];

  return rawPlaces.map((p: any) => ({
    placeId: p.id,
    name: p.displayName?.text || 'Unknown Business',
    address: p.formattedAddress || 'Address not listed',
    types: p.types || [],
    mapsUrl: p.googleMapsUri || '',
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    website: p.websiteUri || null,
    phone: p.nationalPhoneNumber || null,
    fetchedAt: Date.now()
  }));
}

export async function generateOutreachProposal(business: {
  name: string;
  category?: string;
  website?: string | null;
  rating?: number | null;
  reasons: string[];
}): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You write first-contact outreach messages for Azumco, a full-service digital presence studio (web development, high-ticket lead-gen systems, workflows, performance marketing).

Target business:
- Name: ${business.name}
- Category: ${business.category || 'Local Business'}
- Website: ${business.website || 'None / Broken'}
- Rating: ${business.rating ? `${business.rating}/5` : 'Unknown'}
- Weaknesses found: ${business.reasons.join(', ')}

Rules:
- Under 75 words.
- Tone: Plain, human, completely free of marketing hype, buzzwords, or pushy sales language.
- Speak directly to the business owner.
- Reference one specific gap noticed (e.g. absent mobile site, missing contact funnel, or lead capture).
- Offer one low-friction direct next step (e.g., "Happy to show you what we built for a similar practice in 5 mins").
- No emojis, no fake flattery, no boilerplate signatures.`
            }]
          }]
        })
      });

      if (response.ok) {
        const result = await response.json();
        const candidateText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim().length > 0) {
          return candidateText.trim();
        }
      }
    } catch {
      // Fallback below
    }
  }

  const primaryIssue = business.reasons[0] || 'your online customer funnel';
  return `Hi ${business.name} team,

I was looking at local ${business.category || 'businesses'} in the area and noticed ${primaryIssue.toLowerCase()}. We build clean, high-converting digital platforms and client acquisition systems at Azumco.

If you're open to it, I can send over a 2-minute breakdown of how we'd tighten this up to bring in qualified clients. Let me know if that’s helpful.

Best,
Zeeshan | Azumco`;
}
