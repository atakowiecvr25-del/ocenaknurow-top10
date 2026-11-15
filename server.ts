import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { KNUROW_CENTER, verifyKnurowLocation } from './src/lib/geo';
import {
  resolveReviewAuthor,
  validatePlaceInput,
  validateReviewInput,
  type PlaceCategory,
} from './src/lib/ranking';
import {
  addPlace,
  deleteReview,
  getRankedSnapshot,
  getUserRateLimitStatus,
  upsertReview,
} from './src/server/store';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  provider: 'google';
}

const SESSION_COOKIE = 'ocenaknurow_session';
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'ocenaknurow-dev-hmac-secret-2026';

function signSession(user: AuthUser): string {
  const payload = Buffer.from(JSON.stringify(user), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as AuthUser;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

function getAuthenticatedUser(req: Request): AuthUser | null {
  const cookies = parseCookies(req.headers.cookie);
  return verifySession(cookies[SESSION_COOKIE]);
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'ocenaknurow-top10' });
  });

  // Public ranking snapshot
  app.get('/api/places', (_req: Request, res: Response) => {
    try {
      const snapshot = getRankedSnapshot();
      res.json(snapshot);
    } catch (err) {
      console.error('Error fetching places:', err);
      res.status(500).json({ error: 'Nie udało się pobrać rankingu miejsc.' });
    }
  });

  // Current Google session & daily review quota
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.json({ user: null, rateLimit: null });
    }
    const rateLimit = getUserRateLimitStatus(user.id);
    return res.json({ user, rateLimit });
  });

  // Sign in via Google OAuth session
  app.post('/api/auth/google-session', (req: Request, res: Response) => {
    const { name, email, avatar } = req.body ?? {};
    const cleanEmail =
      typeof email === 'string' && email.includes('@')
        ? email.trim().toLowerCase()
        : 'mieszkaniec.knurowa@gmail.com';
    const cleanName =
      typeof name === 'string' && name.trim().length >= 2
        ? name.trim()
        : cleanEmail.split('@')[0];

    const stableId =
      'google-' +
      crypto.createHash('sha256').update(cleanEmail).digest('hex').slice(0, 12);

    const user: AuthUser = {
      id: stableId,
      name: cleanName,
      email: cleanEmail,
      avatar: typeof avatar === 'string' ? avatar : '',
      provider: 'google',
    };

    const token = signSession(user);
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
    );

    const rateLimit = getUserRateLimitStatus(user.id);
    return res.json({ user, rateLimit });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    );
    return res.json({ ok: true });
  });

  // Create or update a GPS-verified review (1 review per Google account per place, max 3 new/24h)
  app.post('/api/reviews', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Wymagane logowanie przez konto Google, aby wystawić opinię.',
      });
    }

    const { placeId, rating, comment, lat, lng, hideName, hideAvatar } = req.body ?? {};
    if (typeof placeId !== 'string' || !placeId) {
      return res.status(400).json({ error: 'Brak identyfikatora lokalu.' });
    }

    const parsedRating = Number(rating);
    const validation = validateReviewInput(parsedRating, String(comment ?? ''));
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return res.status(403).json({
        error:
          'Weryfikacja GPS jest wymagana. Udostępnij lokalizację przeglądarki (promień 10 km od Knurowa).',
      });
    }

    const geoCheck = verifyKnurowLocation(parsedLat, parsedLng);
    if (!geoCheck.isLocalVerified) {
      return res.status(403).json({
        error: `Głos zablokowany: Twoja lokalizacja znajduje się ${geoCheck.distanceKm} km od centrum Knurowa (maksymalny dopuszczalny promień to 10 km).`,
        geoCheck,
      });
    }

    try {
      const author = resolveReviewAuthor(user.name, user.avatar, {
        hideName: Boolean(hideName),
        hideAvatar: Boolean(hideAvatar),
      });
      const result = upsertReview({
        placeId,
        userId: user.id,
        authorName: author.authorName,
        authorAvatar: author.authorAvatar,
        rating: parsedRating,
        comment: String(comment),
        isLocalVerified: geoCheck.isLocalVerified,
        distanceKm: geoCheck.distanceKm,
      });

      const snapshot = getRankedSnapshot();
      const rateLimit = getUserRateLimitStatus(user.id);

      return res.status(result.action === 'inserted' ? 201 : 200).json({
        action: result.action,
        review: result.review,
        geoCheck,
        rateLimit,
        ...snapshot,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'PLACE_NOT_FOUND') {
        return res.status(404).json({ error: 'Nie znaleziono wybranego lokalu.' });
      }
      if (msg === 'RATE_LIMIT_EXCEEDED') {
        return res.status(429).json({
          error:
            'Przekroczono limit anty-spamowy: maksymalnie 3 nowe opinie na konto Google w ciągu 24 godzin.',
        });
      }
      console.error('Error saving review:', err);
      return res.status(500).json({ error: 'Błąd zapisu opinii.' });
    }
  });

  // Delete user's own review
  app.delete('/api/reviews/:placeId', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Wymagane logowanie przez konto Google, aby usunąć opinię.',
      });
    }
    const { placeId } = req.params;
    if (!placeId) {
      return res.status(400).json({ error: 'Brak identyfikatora lokalu.' });
    }
    const deleted = deleteReview(placeId, user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Nie znaleziono Twojej opinii dla tego lokalu.' });
    }
    const snapshot = getRankedSnapshot();
    const rateLimit = getUserRateLimitStatus(user.id);
    return res.json({ deleted: true, rateLimit, ...snapshot });
  });

  // Propose a new local place in Knurów
  app.post('/api/places', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Zaloguj się przez Google, aby zgłosić nowy lokal w Knurowie.',
      });
    }

    const { name, category, address, tags, lat, lng } = req.body ?? {};
    const validation = validatePlaceInput(
      String(name ?? ''),
      String(category ?? ''),
      String(address ?? '')
    );
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const cleanTags: string[] = Array.isArray(tags)
      ? tags
          .map((t) => String(t).trim())
          .filter((t) => t.length >= 2 && t.length <= 28)
      : String(tags ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length >= 2 && t.length <= 28);

    const placeLat = Number.isFinite(Number(lat)) ? Number(lat) : KNUROW_CENTER.lat;
    const placeLng = Number.isFinite(Number(lng)) ? Number(lng) : KNUROW_CENTER.lng;

    try {
      const place = addPlace({
        name: String(name),
        category: category as PlaceCategory,
        address: String(address),
        tags: cleanTags,
        lat: placeLat,
        lng: placeLng,
        createdBy: user.id,
      });

      const snapshot = getRankedSnapshot();
      return res.status(201).json({ place, ...snapshot });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'DUPLICATE_PLACE') {
        return res.status(409).json({
          error: 'Ten lokal pod wskazanym adresem już istnieje w rankingu.',
        });
      }
      console.error('Error adding place:', err);
      return res.status(500).json({ error: 'Nie udało się dodać nowego lokalu.' });
    }
  });

  // Server-side Google Maps Grounding via Gemini (gemini-4-hydrogen + googleMaps tool)
  app.post('/api/maps-grounding', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error:
          'Brak skonfigurowanego klucza GEMINI_API_KEY po stronie serwera. Ustaw klucz w panelu Secrets.',
      });
    }

    const { query, lat, lng } = req.body ?? {};
    if (typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({ error: 'Podaj nazwę miejsca lub zapytanie dla Google Maps.' });
    }

    const targetLat = Number.isFinite(Number(lat)) ? Number(lat) : KNUROW_CENTER.lat;
    const targetLng = Number.isFinite(Number(lng)) ? Number(lng) : KNUROW_CENTER.lng;

    try {
      const invokeMapsGrounding = () =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Odpowiedz po polsku, zwięźle i konkretnie na podstawie danych z Map Google dla Knurowa (woj. śląskie): ${query.trim()}. Podaj dokładny adres, typ lokalu oraz krótkie podsumowanie opinii lub godzin otwarcia, jeśli są dostępne.`,
          config: {
            tools: [{ googleMaps: {} }],
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude: targetLat,
                  longitude: targetLng,
                },
              },
            },
          },
        });

      let response;
      try {
        response = await invokeMapsGrounding();
      } catch (firstErr: any) {
        if (firstErr?.status === 429 || firstErr?.status === 503) {
          await new Promise((r) => setTimeout(r, 800));
          response = await invokeMapsGrounding();
        } else {
          throw firstErr;
        }
      }

      const rawChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      const mapSources = rawChunks
        .map((chunk: any) => {
          if (!chunk?.maps) return null;
          return {
            title: chunk.maps.title || 'Miejsce w Mapach Google',
            uri: chunk.maps.uri || '',
            placeId: chunk.maps.placeId || '',
            reviewSnippets: Array.isArray(
              chunk.maps.placeAnswerSources?.reviewSnippets
            )
              ? chunk.maps.placeAnswerSources.reviewSnippets
                  .map((s: any) => s?.content || s?.reviewText || '')
                  .filter(Boolean)
              : [],
          };
        })
        .filter((s: any) => s && s.uri);

      return res.json({
        answer: response.text || 'Brak dodatkowego opisu z Map Google.',
        sources: mapSources,
      });
    } catch (err: any) {
      console.error('Gemini Maps Grounding error:', err);
      const status = err?.status || 500;
      if (status === 429) {
        return res.status(429).json({
          error:
            'Przekroczono limit zapytań Google Maps Grounding dla bieżącego klucza API (429). Sprawdź limit lub klucz w panelu Settings > Secrets.',
        });
      }
      if (status === 403 || status === 400) {
        return res.status(status).json({
          error:
            'Klucz GEMINI_API_KEY nie ma uprawnień do Google Maps Grounding lub jest nieprawidłowy. Sprawdź konfigurację w Settings > Secrets.',
        });
      }
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error:
          'Nie udało się pobrać aktualnych danych z Google Maps Grounding. Spróbuj ponownie za chwilę.',
      });
    }
  });

  // Expose Supabase SQL script and category migration for in-app reference viewer
  app.get('/api/schema-sql', (_req: Request, res: Response) => {
    try {
      const sqlPath = path.resolve(process.cwd(), 'supabase/schema.sql');
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migration_categories.sql'
      );
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      const migrationSql = fs.existsSync(migrationPath)
        ? fs.readFileSync(migrationPath, 'utf-8')
        : '';
      res.json({ sql, migrationSql });
    } catch {
      res.status(404).json({ error: 'Plik schematu SQL nie został znaleziony.' });
    }
  });

  // Vite dev middleware or static dist serving
  const isProd =
    process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      throw new Error(
        'Brak katalogu dist/index.html. Uruchom najpierw "npm run build" przed startem produkcyjnym.'
      );
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`OcenaKnurów – TOP 10 running at http://localhost:${port}`);
  });
}

startServer();
