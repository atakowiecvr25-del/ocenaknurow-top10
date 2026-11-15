-- ============================================================================
-- OcenaKnurów – TOP 10 | Panel Administratora (Statystyki kont, opinii i moderacja)
-- Wklej i uruchom (Run) w Supabase -> SQL Editor.
-- Bezpieczne dla istniejącej bazy: nie usuwa żadnych danych ani recenzji.
-- Dostęp do funkcji get_admin_dashboard() oraz usuwania spamu ma WYŁĄCZNIE
-- konto Google administratora: atakowiecvr25@gmail.com
-- ============================================================================

-- 1. Polityki RLS pozwalające administratorowi moderować (usuwać) spamowe opinie i lokale
DROP POLICY IF EXISTS "Admin może usunąć dowolną opinię" ON public.reviews;
CREATE POLICY "Admin może usunąć dowolną opinię"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'atakowiecvr25@gmail.com');

DROP POLICY IF EXISTS "Admin może usunąć zgłoszony lokal" ON public.places;
CREATE POLICY "Admin może usunąć zgłoszony lokal"
  ON public.places FOR DELETE
  TO authenticated
  USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'atakowiecvr25@gmail.com');

-- 2. Funkcja RPC zwracająca pełne statystyki użytkowników (auth.users), opinii i zgłoszeń
CREATE OR REPLACE FUNCTION public.get_admin_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_email text;
  result jsonb;
BEGIN
  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF caller_email <> 'atakowiecvr25@gmail.com' THEN
    RAISE EXCEPTION 'Brak uprawnień administratora';
  END IF;

  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalUsers', (SELECT count(*) FROM auth.users),
      'activeUsers24h', (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= now() - interval '24 hours'),
      'activeUsers7d', (SELECT count(*) FROM auth.users WHERE last_sign_in_at >= now() - interval '7 days'),
      'totalReviews', (SELECT count(*) FROM public.reviews),
      'reviews24h', (SELECT count(*) FROM public.reviews WHERE GREATEST(created_at, updated_at) >= now() - interval '24 hours'),
      'reviews7d', (SELECT count(*) FROM public.reviews WHERE GREATEST(created_at, updated_at) >= now() - interval '7 days'),
      'totalPlaces', (SELECT count(*) FROM public.places),
      'communityPlacesCount', (SELECT count(*) FROM public.places WHERE created_by IS NOT NULL)
    ),
    'users', COALESCE((
      SELECT jsonb_agg(u_row ORDER BY u_row.sort_ts DESC NULLS LAST)
      FROM (
        SELECT
          u.id::text AS id,
          coalesce(u.email, '') AS email,
          coalesce(
            u.raw_user_meta_data->>'full_name',
            u.raw_user_meta_data->>'name',
            split_part(coalesce(u.email, 'Użytkownik'), '@', 1)
          ) AS "fullName",
          coalesce(
            u.raw_user_meta_data->>'avatar_url',
            u.raw_user_meta_data->>'picture',
            ''
          ) AS "avatarUrl",
          u.created_at AS "createdAt",
          u.last_sign_in_at AS "lastSignInAt",
          coalesce((
            SELECT host(s.ip)
            FROM auth.sessions s
            WHERE s.user_id = u.id AND s.ip IS NOT NULL
            ORDER BY coalesce(s.updated_at, s.created_at) DESC
            LIMIT 1
          ), '') AS "lastIp",
          coalesce((
            SELECT s.user_agent
            FROM auth.sessions s
            WHERE s.user_id = u.id AND s.user_agent IS NOT NULL
            ORDER BY coalesce(s.updated_at, s.created_at) DESC
            LIMIT 1
          ), '') AS "lastUserAgent",
          (SELECT count(*) FROM public.reviews r WHERE r.user_id = u.id) AS "reviewsCount",
          (SELECT count(*) FROM public.places p WHERE p.created_by = u.id) AS "placesAddedCount",
          coalesce(u.last_sign_in_at, u.created_at) AS sort_ts
        FROM auth.users u
      ) u_row
    ), '[]'::jsonb),
    'recentReviews', COALESCE((
      SELECT jsonb_agg(r_row ORDER BY r_row.activity_ts DESC)
      FROM (
        SELECT
          r.id::text AS id,
          r.place_id::text AS "placeId",
          coalesce(p.name, 'Nieznany lokal') AS "placeName",
          coalesce(p.category, 'inne') AS "placeCategory",
          r.user_id::text AS "userId",
          r.author_name AS "authorName",
          coalesce(u.email, '') AS "userEmail",
          coalesce(
            u.raw_user_meta_data->>'full_name',
            u.raw_user_meta_data->>'name',
            ''
          ) AS "userGoogleName",
          r.rating AS rating,
          r.comment AS comment,
          r.is_local_verified AS "isLocalVerified",
          coalesce(r.distance_km, 0) AS "distanceKm",
          r.created_at AS "createdAt",
          r.updated_at AS "updatedAt",
          (r.updated_at > r.created_at + interval '2 seconds') AS "isEdited",
          GREATEST(r.created_at, r.updated_at) AS activity_ts
        FROM public.reviews r
        LEFT JOIN public.places p ON p.id = r.place_id
        LEFT JOIN auth.users u ON u.id = r.user_id
        ORDER BY GREATEST(r.created_at, r.updated_at) DESC
        LIMIT 40
      ) r_row
    ), '[]'::jsonb),
    'communityPlaces', COALESCE((
      SELECT jsonb_agg(p_row ORDER BY p_row."createdAt" DESC)
      FROM (
        SELECT
          p.id::text AS id,
          p.name AS name,
          p.category AS category,
          p.address AS address,
          coalesce(u.email, '') AS "creatorEmail",
          coalesce(
            u.raw_user_meta_data->>'full_name',
            u.raw_user_meta_data->>'name',
            ''
          ) AS "creatorName",
          p.created_at AS "createdAt"
        FROM public.places p
        LEFT JOIN auth.users u ON u.id = p.created_by
        WHERE p.created_by IS NOT NULL
        ORDER BY p.created_at DESC
        LIMIT 50
      ) p_row
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
