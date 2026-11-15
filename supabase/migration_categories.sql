-- ============================================================================
-- Migracja kategorii dla istniejącej bazy Supabase (OcenaKnurów – TOP 10)
-- Wklej i kliknij RUN w Supabase -> SQL Editor, aby zaktualizować kategorie:
-- Barbershop / Fryzjer / Żabka / Lidl / Biedronka / Markety / Kebab / Pizzerie / Restauracje / Kawiarnie / Szkoły / Siłownie / Boiska / Inne
-- ============================================================================

-- 1. Usuń stary warunek CHECK na kolumnie category (zanim zaktualizujemy stare wiersze)
ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_category_check;

DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.places'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.places DROP CONSTRAINT IF EXISTS %I', c_name);
  END LOOP;
END $$;

-- 2. Rozdziel istniejące rekordy ze starej kategorii 'sklepy', przenieś siłownie/boiska z 'inne' i znormalizuj nieznane
UPDATE public.places SET category = 'lidl' WHERE category = 'sklepy' AND name ILIKE '%lidl%';
UPDATE public.places SET category = 'zabka' WHERE category = 'sklepy' AND (name ILIKE '%żabka%' OR name ILIKE '%zabka%');
UPDATE public.places SET category = 'biedronka' WHERE category = 'sklepy' AND name ILIKE '%biedronka%';
UPDATE public.places
SET category = 'silownie'
WHERE category IN ('inne', 'sklepy')
  AND (
    name ILIKE '%fitness%'
    OR name ILIKE '%siłownia%'
    OR name ILIKE '%silownia%'
    OR name ILIKE '%spartan%'
    OR name ILIKE '%health lab%'
    OR name ILIKE '%one step%'
    OR name ILIKE '%uniwersytet siły%'
    OR name ILIKE '%gym city%'
    OR name ILIKE '%gmcity%'
  );
UPDATE public.places
SET category = 'boiska'
WHERE category IN ('inne', 'sklepy')
  AND (
    name ILIKE '%orlik%'
    OR name ILIKE '%boisko%'
    OR name ILIKE '%stadion%'
    OR name ILIKE '%kort%'
  );
UPDATE public.places
SET category = 'pizzeria',
    name = 'Pub 777 (Pizzeria i Pub)',
    tags = ARRAY['pizza', 'pub', 'kuchnia polska']
WHERE name ILIKE '%pub 777%'
  AND NOT EXISTS (
    SELECT 1 FROM public.places p2
    WHERE lower(p2.name) = lower('Pub 777 (Pizzeria i Pub)') AND p2.id <> public.places.id
  );
UPDATE public.places
SET category = 'pizzeria'
WHERE name ILIKE '%pub 777%';
UPDATE public.places
SET category = 'restauracje'
WHERE category IN ('inne', 'sklepy')
  AND (
    name ILIKE '%quoc-cuong%'
    OR name ILIKE '%korzenie śląska%'
    OR name ILIKE '%frytkarz%'
    OR name ILIKE '%przystanek burger%'
    OR name ILIKE '%orso%'
    OR name ILIKE '%zielony ogród%'
    OR name ILIKE '%ice pub%'
    OR name ILIKE '%mcdonald%'
  );
UPDATE public.places
SET category = 'kawiarnie'
WHERE category IN ('inne', 'sklepy')
  AND (
    name ILIKE '%ferlo%'
    OR name ILIKE '%lova%'
    OR name ILIKE '%sebusia%'
    OR name ILIKE '%zbyszka%'
    OR name ILIKE '%art cafe%'
    OR name ILIKE '%coś słodkiego%'
    OR name ILIKE '%cos slodkiego%'
    OR name ILIKE '%słodki domek%'
    OR name ILIKE '%slodki domek%'
  );
UPDATE public.places
SET category = 'markety'
WHERE category IN ('inne', 'sklepy')
  AND (
    name ILIKE '%dino%'
    OR name ILIKE '%kaufland%'
    OR name ILIKE '%aldi%'
    OR name ILIKE '%netto%'
    OR name ILIKE '%stokrotka%'
    OR name ILIKE '%rossmann%'
    OR name ILIKE '%pepco%'
  );
UPDATE public.places SET category = 'inne' WHERE category NOT IN ('kebab', 'barber', 'fryzjer', 'zabka', 'lidl', 'biedronka', 'markety', 'szkoly', 'pizzeria', 'restauracje', 'kawiarnie', 'silownie', 'boiska', 'inne');

-- 3. Teraz bezpiecznie dodaj nowe ograniczenie CHECK
ALTER TABLE public.places
  ADD CONSTRAINT places_category_check
  CHECK (category IN ('kebab', 'barber', 'fryzjer', 'zabka', 'lidl', 'biedronka', 'markety', 'szkoly', 'pizzeria', 'restauracje', 'kawiarnie', 'silownie', 'boiska', 'inne'));

-- 4. Popraw widok Bayesa dla lokali z 0 recenzji (LEFT JOIN NULL fix)
CREATE OR REPLACE VIEW public.places_with_bayes_ranking AS
WITH global_stats AS (
  SELECT COALESCE(AVG(rating)::numeric, 7.0) AS c_global
  FROM public.reviews
  WHERE is_local_verified = true
),
place_stats AS (
  SELECT
    p.id,
    p.name,
    p.category,
    p.address,
    p.tags,
    p.lat,
    p.lng,
    p.created_at,
    COUNT(r.id) AS total_votes,
    COUNT(r.id) FILTER (WHERE r.is_local_verified = true) AS verified_votes,
    COALESCE(
      SUM(r.rating * CASE WHEN r.is_local_verified THEN 1.0 ELSE 0.35 END) /
      NULLIF(SUM(CASE WHEN r.id IS NULL THEN 0 WHEN r.is_local_verified THEN 1.0 ELSE 0.35 END), 0),
      NULL
    ) AS raw_average,
    COALESCE(
      SUM(CASE WHEN r.id IS NULL THEN 0 WHEN r.is_local_verified THEN 1.0 ELSE 0.35 END),
      0
    ) AS effective_votes,
    ARRAY[
      COUNT(*) FILTER (WHERE r.rating = 1),
      COUNT(*) FILTER (WHERE r.rating = 2),
      COUNT(*) FILTER (WHERE r.rating = 3),
      COUNT(*) FILTER (WHERE r.rating = 4),
      COUNT(*) FILTER (WHERE r.rating = 5),
      COUNT(*) FILTER (WHERE r.rating = 6),
      COUNT(*) FILTER (WHERE r.rating = 7),
      COUNT(*) FILTER (WHERE r.rating = 8),
      COUNT(*) FILTER (WHERE r.rating = 9),
      COUNT(*) FILTER (WHERE r.rating = 10)
    ] AS rating_distribution
  FROM public.places p
  LEFT JOIN public.reviews r ON r.place_id = p.id
  GROUP BY p.id
)
SELECT
  ps.*,
  ROUND(
    CASE
      WHEN ps.effective_votes > 0 THEN
        ((ps.effective_votes / (ps.effective_votes + 10.0)) * ps.raw_average) +
        ((10.0 / (ps.effective_votes + 10.0)) * gs.c_global)
      ELSE gs.c_global
    END,
    2
  ) AS bayes_score,
  (ps.verified_votes < 10) AS is_provisional
FROM place_stats ps
CROSS JOIN global_stats gs
ORDER BY bayes_score DESC, ps.verified_votes DESC, ps.name ASC;

-- 5. Dodaj pełny katalog lokali w Knurowie (bez duplikatów)
INSERT INTO public.places (name, category, address, tags, lat, lng)
SELECT v.name, v.category, v.address, v.tags, v.lat, v.lng
FROM (
  VALUES
    ('Zahir Kebab Knurów', 'kebab', 'ul. 1 Maja 72, 44-190 Knurów', ARRAY['rollo', '11:00–23:00', 'na wynos'], 50.2275, 18.6762),
    ('Diamond Kebab', 'kebab', 'ul. Jana Sobieskiego 2, 44-190 Knurów', ARRAY['do północy', 'bakława', 'indyjska herbata'], 50.2215, 18.6712),
    ('Junus Kebab', 'kebab', 'ul. Thomasa Woodrowa Wilsona 6, 44-190 Knurów', ARRAY['na miejscu i wynos', 'bułka kraftowa', 'centrum'], 50.2231, 18.6698),
    ('Am Am Kebab', 'kebab', 'ul. Szpitalna 37, 44-190 Knurów', ARRAY['przy Lidlu', 'parking', 'na wynos'], 50.2156, 18.6612),
    ('Istanbulls Pizza Kebab', 'kebab', 'ul. Wincentego Witosa 10, 44-190 Knurów', ARRAY['dowóz', 'drive-through', 'kebab i pizza'], 50.2169, 18.6591),
    ('Sofia Kebab', 'kebab', 'ul. Kapelanów Wojskowych 17A, 44-194 Knurów', ARRAY['ogródek', 'dostawa', 'pt–sob do 24:00'], 50.2194, 18.6625),
    ('Adana Kebab Knurów', 'kebab', 'ul. Koziełka 13, 44-190 Knurów', ARRAY['kebaby i burgery', 'zapiekanki', 'dostawa'], 50.2226, 18.6721),
    ('Ankara Kebab', 'kebab', 'ul. Kosmonautów 18b, 44-194 Knurów', ARRAY['wołowina i kurczak', 'weekend do 24:00'], 50.2189, 18.6634),
    ('HORIZON KEBAB', 'kebab', 'ul. Kosmonautów 23A, 44-194 Knurów', ARRAY['wołowina kraftowa', 'grill', 'weekend do 2:00'], 50.2181, 18.6629),
    ('Pyszny Kebab Szczygłowice', 'kebab', 'al. Piastów 8C, 44-193 Knurów', ARRAY['Szczygłowice', 'codziennie do 23:00'], 50.1978, 18.6401),
    ('Kebab po szychcie', 'kebab', 'ul. Lignozy 63, 44-193 Knurów', ARRAY['Szczygłowice', 'strefa gastronomiczna'], 50.1932, 18.6461),

    ('OG Barbershop', 'barber', 'ul. Kazimierza Wielkiego 20A, 44-190 Knurów', ARRAY['rezerwacja Booksy', 'broda i fade', 'płatność kartą'], 50.2185, 18.6612),
    ('MVP Barbershop', 'barber', 'ul. Kazimierza Wielkiego 20A/1, 44-190 Knurów', ARRAY['rezerwacja online', 'strzyżenie męskie'], 50.2186, 18.6614),
    ('Garaż Barber Shop', 'barber', 'ul. Władysława Łokietka 1A, 44-190 Knurów', ARRAY['klimatyczny lokal', 'broda i włosy'], 50.2202, 18.6651),
    ('Kumpel Barber Shop', 'barber', 'ul. Wincentego Witosa 17, 44-190 Knurów', ARRAY['strzyżenie męskie', 'rezerwacja online'], 50.2165, 18.6598),
    ('Roberto''s Barber Shop', 'barber', 'ul. Armii Krajowej 1C, 44-190 Knurów', ARRAY['combo broda + włosy', 'centrum'], 50.2244, 18.6718),
    ('Fryzjer Męski Atmosfera', 'barber', 'ul. Kazimierza Wielkiego 6A, 44-190 Knurów', ARRAY['fryzjer męski', 'broda', 'strzyżenie'], 50.2198, 18.6635),
    ('Razor Sznyt Barber Shop', 'barber', 'ul. Stefana Batorego 4, 44-194 Knurów', ARRAY['barber', 'broda i fade', 'rezerwacja Booksy'], 50.2217, 18.6632),
    ('Łukasz Bauer Barbershop', 'barber', 'ul. Adama Mickiewicza 7/3, 44-190 Knurów', ARRAY['barber', 'strzyżenie męskie', 'broda'], 50.2248, 18.6695),

    ('Salon Fryzjerski Axiniia', 'fryzjer', 'ul. Kazimierza Wielkiego 20A, 44-194 Knurów', ARRAY['fryzjer', 'rezerwacja Booksy', 'koloryzacja i manicure'], 50.2185, 18.6612),
    ('Pracownia Fryzur Karolina Ślosarczyk', 'fryzjer', 'ul. Lotników 6, 44-190 Knurów', ARRAY['fryzjer damsko-męski', 'koloryzacja'], 50.2191, 18.6632),
    ('Salon Fryzjerski Lila', 'fryzjer', 'ul. Marii Konopnickiej 5F, 44-193 Knurów', ARRAY['strzyżenie damskie', 'modelowanie'], 50.2238, 18.6682),
    ('Chloe Hair & Makeup Salon', 'fryzjer', 'ul. Wilsona 7A, 44-190 Knurów', ARRAY['fryzjer', 'makijaż', 'rezerwacja online'], 50.2232, 18.6701),
    ('Salon Fryzjerski Kamil Pawlik', 'fryzjer', 'ul. Henryka Sienkiewicza 36, 44-190 Knurów', ARRAY['strzyżenie', 'stylizacja'], 50.2259, 18.6736),
    ('HAIRCLUB Dorota Stanek-Giermanek', 'fryzjer', 'ul. Kopalniana 2A, 44-193 Knurów', ARRAY['Szczygłowice', 'salon fryzjerski', 'koloryzacja'], 50.1971, 18.6409),
    ('Hair by Kasia (Katarzyna Rybarczyk)', 'fryzjer', 'ul. Kazimierza Wielkiego 20C/1, 44-194 Knurów', ARRAY['fryzjer', 'stylizacja', 'koloryzacja'], 50.2182, 18.6609),
    ('Zakład Fryzjerski – ul. Staszica 1', 'fryzjer', 'ul. Stanisława Staszica 1, 44-193 Knurów', ARRAY['Szczygłowice', 'damsko-męski'], 50.1963, 18.6392),
    ('Zakład Fryzjerski – ul. Łokietka 3', 'fryzjer', 'ul. Władysława Łokietka 3, 44-194 Knurów', ARRAY['damsko-męski', 'strzyżenie'], 50.2201, 18.6649),
    ('Salon Fryzjerski – al. Lipowa 4', 'fryzjer', 'al. Lipowa 4, 44-193 Knurów', ARRAY['Szczygłowice', 'damsko-męski'], 50.1956, 18.6388),
    ('Sońka Salon Fryzjersko-Kosmetyczny', 'fryzjer', 'ul. Władysława Łokietka 1, 44-194 Knurów', ARRAY['fryzjer', 'kosmetyka', 'rezerwacja Booksy'], 50.2202, 18.6650),
    ('Salon Fryzjerski GABRIELA', 'fryzjer', 'ul. Wincentego Witosa 2D, 44-196 Knurów', ARRAY['fryzjer', 'strzyżenie', 'rezerwacja Booksy'], 50.2170, 18.6583),
    ('Stylove Włosy (Katarzyna Poręba)', 'fryzjer', 'ul. 1 Maja 6, 44-190 Knurów', ARRAY['fryzjer', 'koloryzacja', 'przedłużanie włosów'], 50.2228, 18.6713),
    ('Monika Szyszko Studio Urody', 'fryzjer', 'ul. Wincentego Witosa 23, 44-196 Knurów', ARRAY['fryzjer', 'studio urody', 'stylizacja'], 50.2162, 18.6599),
    ('Salon Fryzjerski „U Ilony”', 'fryzjer', 'ul. Wincentego Witosa 31, 44-196 Knurów', ARRAY['fryzjer', 'strzyżenie', 'modelowanie'], 50.2159, 18.6601),
    ('Zakład Fryzjersko-Kosmetyczny „Alicja”', 'fryzjer', 'ul. Stanisława Staszica 3/1, 44-193 Knurów', ARRAY['Szczygłowice', 'fryzjer', 'kosmetyka'], 50.1961, 18.6391),
    ('Angelika Wojtas Salon Fryzjerski', 'fryzjer', 'ul. Niepodległości 18, 44-190 Knurów', ARRAY['fryzjer', 'koloryzacja', 'centrum'], 50.2208, 18.6685),
    ('Atelier Fryzjerskie u Tomka', 'fryzjer', 'ul. ks. Alojzego Koziełka 92B, 44-190 Knurów', ARRAY['fryzjer', 'damsko-męski', 'stylizacja'], 50.2195, 18.6780),
    ('Salon Fryzjerski „Jola”', 'fryzjer', 'ul. Niepodległości 20, 44-190 Knurów', ARRAY['fryzjer', 'strzyżenie', 'centrum'], 50.2207, 18.6683),
    ('Anna Knapik | Stylistka Fryzur', 'fryzjer', 'ul. ks. Alojzego Koziełka 36, 44-190 Knurów', ARRAY['stylistka fryzur', 'upięcia', 'Booksy'], 50.2219, 18.6742),

    ('Żabka – ul. 1 Maja 7', 'zabka', 'ul. 1 Maja 7, 44-190 Knurów', ARRAY['do 23:00', 'kawa i hot-dog', 'paczki'], 50.2229, 18.6714),
    ('Żabka – ul. 1 Maja 59', 'zabka', 'ul. 1 Maja 59, 44-190 Knurów', ARRAY['do 23:00', 'szybkie zakupy'], 50.2265, 18.6752),
    ('Żabka – ul. Niepodległości 18', 'zabka', 'ul. Niepodległości 18, 44-190 Knurów', ARRAY['otwarte w niedziele', 'szybkie zakupy'], 50.2208, 18.6685),
    ('Żabka – ul. Kazimierza Wielkiego 57', 'zabka', 'ul. Kazimierza Wielkiego 57, 44-190 Knurów', ARRAY['do 23:00', 'odbiór paczek'], 50.2178, 18.6591),
    ('Żabka – ul. Wilsona 11', 'zabka', 'ul. Wilsona 11, 44-190 Knurów', ARRAY['centrum', 'kawa na wynos'], 50.2234, 18.6705),
    ('Żabka – ul. Jana III Sobieskiego 6B', 'zabka', 'ul. Jana III Sobieskiego 6B, 44-190 Knurów', ARRAY['centrum', 'do 23:00', 'paczki'], 50.2212, 18.6716),
    ('Żabka – ul. Lotników 22', 'zabka', 'ul. Lotników 22, 44-190 Knurów', ARRAY['do 23:00', 'hot-dogi', 'płatność kartą'], 50.2188, 18.6621),
    ('Żabka – ul. Stefana Batorego 2', 'zabka', 'ul. Stefana Batorego 2, 44-190 Knurów', ARRAY['osiedle', 'do 23:00'], 50.2219, 18.6639),
    ('Żabka – ul. Kosmonautów 18', 'zabka', 'ul. Kosmonautów 18, 44-194 Knurów', ARRAY['do 23:00', 'kawa na wynos'], 50.2189, 18.6635),
    ('Żabka – ul. Rybna 2', 'zabka', 'ul. Rybna 2, 44-190 Knurów', ARRAY['szybkie zakupy', 'do 23:00'], 50.2252, 18.6709),
    ('Żabka – ul. Stanisława Staszica 9', 'zabka', 'ul. Stanisława Staszica 9, 44-193 Knurów', ARRAY['Szczygłowice', 'do 23:00', 'paczki'], 50.1959, 18.6389),

    ('Lidl Knurów – ul. Szpitalna 37a', 'lidl', 'ul. Szpitalna 37a, 44-190 Knurów', ARRAY['duży parking', 'piekarnia', 'kasy samoobsługowe'], 50.2155, 18.6611),
    ('Lidl Knurów – ul. Bolesława Prusa 1', 'lidl', 'ul. Bolesława Prusa 1, 44-190 Knurów', ARRAY['parking', 'do 22:00', 'piekarnia'], 50.2288, 18.6754),

    ('Biedronka – ul. Dworcowa 64', 'biedronka', 'ul. Dworcowa 64, 44-190 Knurów', ARRAY['duży parking', 'kasy samoobsługowe', 'do 22:00'], 50.2261, 18.6798),
    ('Biedronka – ul. Szpitalna 9', 'biedronka', 'ul. Szpitalna 9, 44-190 Knurów', ARRAY['centrum', 'piekarnia'], 50.2219, 18.6691),
    ('Biedronka – ul. Niepodległości 9', 'biedronka', 'ul. Niepodległości 9, 44-190 Knurów', ARRAY['parking', 'płatność kartą'], 50.2212, 18.6695),
    ('Biedronka – ul. Parkowa 2', 'biedronka', 'ul. Parkowa 2, 44-193 Knurów', ARRAY['Szczygłowice', 'parking'], 50.1972, 18.6415),
    ('Biedronka – ul. Witosa 4', 'biedronka', 'ul. Wincentego Witosa 4, 44-190 Knurów', ARRAY['Wojska Polskiego', 'kasy samoobsługowe'], 50.2169, 18.6584),

    ('I Liceum Ogólnokształcące im. I. J. Paderewskiego', 'szkoly', 'ul. 1 Maja 21, 44-190 Knurów', ARRAY['liceum', 'matura', 'centrum'], 50.2241, 18.6725),
    ('Miejska Szkoła Podstawowa nr 1', 'szkoly', 'ul. Antoniego Słoniny 1, 44-190 Knurów', ARRAY['szkoła podstawowa', 'boisko'], 50.2216, 18.6731),
    ('Miejska Szkoła Podstawowa nr 2', 'szkoly', 'ul. Thomasa Woodrowa Wilsona 22, 44-190 Knurów', ARRAY['szkoła podstawowa', 'klasy sportowe'], 50.2239, 18.6681),
    ('Miejska Szkoła Podstawowa nr 3 (ZSP 1)', 'szkoly', 'ul. Feliksa Michalskiego 27, 44-190 Knurów', ARRAY['szkoła podstawowa', 'ZSP nr 1'], 50.2279, 18.6744),
    ('Miejska Szkoła Podstawowa nr 4 (ZSP 2)', 'szkoly', 'ul. Jana Kilińskiego 6, 44-193 Knurów', ARRAY['Szczygłowice', 'szkoła podstawowa', 'ZSP nr 2'], 50.1981, 18.6442),
    ('Miejska Szkoła Podstawowa nr 6 (ZSP 3)', 'szkoly', 'ul. Stefana Batorego 5, 44-194 Knurów', ARRAY['szkoła podstawowa', 'ZSP nr 3'], 50.2215, 18.6626),
    ('Miejska Szkoła Podstawowa nr 7 (MSP 7)', 'szkoly', 'ul. Jedności Narodowej 5, 44-194 Knurów', ARRAY['szkoła podstawowa', 'boisko'], 50.2194, 18.6594),
    ('Miejska Szkoła Podstawowa nr 9', 'szkoly', 'al. Lipowa 12, 44-193 Knurów', ARRAY['Szczygłowice', 'szkoła podstawowa'], 50.1945, 18.6382),

    ('Da Grasso Knurów', 'pizzeria', 'ul. 1 Maja 72A, 44-190 Knurów', ARRAY['pizza', 'dowóz', 'sosy w cenie'], 50.2276, 18.6763),
    ('Mała Toscania', 'pizzeria', 'ul. Wincentego Witosa 31A, 44-196 Knurów', ARRAY['włoska pizza', 'piec opalany drewnem', 'ogródek'], 50.2159, 18.6601),
    ('Icoino Włoska Pizzeria', 'pizzeria', 'ul. Wincentego Witosa 2A, 44-196 Knurów', ARRAY['neapolitańska', 'piec opalany drewnem', 'dowóz'], 50.2171, 18.6582),
    ('Meta-Morfoza Pizzeria', 'pizzeria', 'ul. Wolności 26, 44-190 Knurów', ARRAY['pizza', 'obiady', 'centrum'], 50.2211, 18.6728),
    ('Pizzeria Gruby Benek', 'pizzeria', 'ul. Wincentego Witosa 13, 44-196 Knurów', ARRAY['pizza', 'burgery', 'dowóz'], 50.2167, 18.6593),
    ('Restauracja i Pizzeria San Remo', 'pizzeria', 'ul. Szpitalna 1, 44-190 Knurów', ARRAY['kuchnia włoska', 'makarony', 'dowóz'], 50.2225, 18.6703),

    ('Kryta Pływalnia aQuaRelax', 'inne', 'ul. Szpitalna 23, 44-190 Knurów', ARRAY['basen', 'sauna', 'zjeżdżalnia'], 50.2183, 18.6648),
    ('Kąpielisko Leśne Zacisze (MOSiR)', 'inne', 'ul. Niepodległości 109, 44-190 Knurów', ARRAY['kąpielisko letnie', 'rekreacja', 'siatkówka'], 50.2118, 18.6589),
    ('Hala Sportowa MOSiR Szczygłowice', 'inne', 'al. Lipowa 12A, 44-193 Knurów', ARRAY['sport', 'siłownia', 'Szczygłowice'], 50.1948, 18.6386),
    ('Kaufland Knurów', 'markety', 'ul. 1 Maja 70, 44-190 Knurów', ARRAY['hipermarket', 'duży parking', 'apteka'], 50.2273, 18.6761),
    ('ALDI Knurów', 'markety', 'ul. 1 Maja 49, 44-190 Knurów', ARRAY['market', 'parking', 'piekarnia'], 50.2256, 18.6744),
    ('Netto Knurów', 'markety', 'ul. Mieszka I 6, 44-190 Knurów', ARRAY['dyskont', 'parking', 'zakupy'], 50.2249, 18.6654),
    ('Dino – ul. Niepodległości 42', 'markety', 'ul. Niepodległości 42, 44-190 Knurów', ARRAY['market', 'stoisko mięsne', 'parking'], 50.2192, 18.6662),
    ('Dino – ul. Rybnicka 37A', 'markety', 'ul. Rybnicka 37A, 44-193 Knurów', ARRAY['Szczygłowice', 'market', 'parking'], 50.1995, 18.6458),
    ('Dino – ul. Ułanów 2', 'markety', 'ul. Ułanów 2, 44-190 Knurów', ARRAY['market', 'parking'], 50.2282, 18.6684),
    ('McDonald''s Knurów', 'restauracje', 'ul. 1 Maja 76, 44-190 Knurów', ARRAY['McDrive', 'fast-food', 'parking'], 50.2281, 18.6768),
    ('Rossmann – ul. 1 Maja 74', 'markety', 'ul. 1 Maja 74, 44-190 Knurów', ARRAY['drogeria', 'kosmetyki', 'centrum'], 50.2278, 18.6764),
    ('Rossmann – ul. Szpitalna 37', 'markety', 'ul. Szpitalna 37, 44-196 Knurów', ARRAY['drogeria', 'parking'], 50.2158, 18.6613),
    ('Pepco – ul. 1 Maja 74', 'markety', 'ul. 1 Maja 74, 44-190 Knurów', ARRAY['odzież', 'dom i dekoracje'], 50.2279, 18.6765),
    ('Pepco – ul. Szpitalna 37', 'markety', 'ul. Szpitalna 37, 44-196 Knurów', ARRAY['odzież', 'dom', 'parking'], 50.2159, 18.6615),
    ('Kino Scena Kultura', 'inne', 'ul. Niepodległości 26, 44-190 Knurów', ARRAY['kino', 'koncerty', 'Centrum Kultury'], 50.2203, 18.6678),
    ('Dom Kultury Knurów-Szczygłowice', 'inne', 'ul. Górnicza 1, 44-193 Knurów', ARRAY['Szczygłowice', 'wydarzenia', 'kultura'], 50.1984, 18.6422),
    ('Xtreme Fitness Knurów', 'silownie', 'ul. Szpitalna 37, 44-194 Knurów', ARRAY['siłownia', 'fitness', 'parking'], 50.2157, 18.6614),
    ('Klub Fitness NJN', 'silownie', 'ul. Wincentego Witosa 12, 44-196 Knurów', ARRAY['siłownia', 'zajęcia grupowe'], 50.2168, 18.6594),
    ('Siłownia MOSiR Knurów', 'silownie', 'ul. Górnicza 2, 44-193 Knurów', ARRAY['siłownia', 'MOSiR', 'Szczygłowice'], 50.1981, 18.6425),
    ('Spartan Team Knurów', 'silownie', 'ul. Szpitalna 29, 44-194 Knurów', ARRAY['sztuki walki', 'siłownia', 'treningi'], 50.2178, 18.6642),
    ('Health Lab Knurów', 'silownie', 'ul. Kapelanów Wojskowych 2E, 44-194 Knurów', ARRAY['siłownia', 'trening personalny', 'dietetyka'], 50.2191, 18.6621),
    ('One Step Active Studio', 'silownie', 'ul. Wincentego Witosa 29, 44-196 Knurów', ARRAY['studio fitness', 'trening motoryczny'], 50.2160, 18.6600),
    ('Uniwersytet Siły (Studio Fitness)', 'silownie', 'ul. 1 Maja 51A, 44-190 Knurów', ARRAY['siłownia', 'fitness', 'trening siłowy'], 50.2259, 18.6746),
    ('Klub Fitness NJN – ul. 1 Maja', 'silownie', 'ul. 1 Maja 51, 44-190 Knurów', ARRAY['siłownia', 'fitness', 'centrum'], 50.2258, 18.6745),
    ('Gym City Knurów', 'silownie', 'ul. 1 Maja 74, 44-190 Knurów', ARRAY['siłownia', 'fitness', 'centrum'], 50.2278, 18.6764),

    ('Orlik MOSiR Knurów (ul. Ułanów / al. Lipowa)', 'boiska', 'ul. Ułanów 8, 44-194 Knurów', ARRAY['Orlik', 'MOSiR', 'sztuczna trawa', 'oświetlenie'], 50.2286, 18.6672),
    ('Boisko „Siódemka” (MSP nr 7)', 'boiska', 'ul. Jedności Narodowej 5, 44-194 Knurów', ARRAY['Siódemka', 'boisko wielofunkcyjne', 'piłka nożna', 'koszykówka'], 50.2195, 18.6596),
    ('Boisko „Szóstka” (MSP nr 6 / ZSP 3)', 'boiska', 'ul. Stefana Batorego 5, 44-194 Knurów', ARRAY['Szóstka', 'boisko szkolne', 'osiedle'], 50.2216, 18.6627),
    ('Boisko „Trójka” (MSP nr 3 / ZSP 1)', 'boiska', 'ul. Feliksa Michalskiego 27, 44-193 Knurów', ARRAY['Trójka', 'boisko szkolne', 'piłka nożna'], 50.2279, 18.6746),
    ('Orlik na Paderku (I LO im. I. J. Paderewskiego)', 'boiska', 'ul. 1 Maja 21, 44-190 Knurów', ARRAY['Paderek', 'Orlik', 'centrum', 'piłka nożna'], 50.2242, 18.6726),
    ('Stadion Miejski MOSiR Knurów (Concordia)', 'boiska', 'ul. Dworcowa 28, 44-190 Knurów', ARRAY['stadion', 'MOSiR', 'boisko główne', 'trybuny'], 50.2254, 18.6776),
    ('Boisko Wielofunkcyjne – Szczygłowice (MSP nr 4)', 'boiska', 'ul. Jana Kilińskiego 6, 44-193 Knurów', ARRAY['Szczygłowice', 'boisko wielofunkcyjne', 'osiedle'], 50.1982, 18.6443),
    ('Boisko MOSiR Szczygłowice (przy Hali Sportowej)', 'boiska', 'al. Lipowa 12A, 44-193 Knurów', ARRAY['Szczygłowice', 'MOSiR', 'boisko zewnętrzne'], 50.1949, 18.6388),
    ('Korty Tenisowe MOSiR Knurów', 'boiska', 'al. Lipowa 12B, 44-193 Knurów', ARRAY['tenis', 'MOSiR', 'Szczygłowice'], 50.1947, 18.6383),

    ('Szpital w Knurowie', 'inne', 'ul. Niepodległości 8, 44-190 Knurów', ARRAY['szpital', 'izba przyjęć', 'opieka medyczna'], 50.2215, 18.6698),
    ('Urząd Miasta Knurów', 'inne', 'ul. dr. Floriana Ogana 5, 44-190 Knurów', ARRAY['urząd miasta', 'sprawy obywatelskie', 'centrum'], 50.2229, 18.6719),
    ('Pub 777 (Pizzeria i Pub)', 'pizzeria', 'ul. 1 Maja 25, 44-190 Knurów', ARRAY['pizza', 'pub', 'kuchnia polska'], 50.2244, 18.6729),
    ('Przystanek Burger', 'restauracje', 'ul. Szpitalna 19, 44-190 Knurów', ARRAY['burgery', 'street food', 'centrum'], 50.2192, 18.6656),
    ('Pracownia Smaku Orso', 'restauracje', 'ul. Kapelanów Wojskowych 15A, 44-194 Knurów', ARRAY['restauracja', 'steki i kuchnia polska', 'imprezy'], 50.2193, 18.6624),
    ('Bistro Korzenie Śląska', 'restauracje', 'ul. 1 Maja 57, 44-190 Knurów', ARRAY['bistro', 'kuchnia śląska', 'obiady'], 50.2263, 18.6750),
    ('Bar Orientalny Quoc-Cuong', 'restauracje', 'ul. Kosmonautów 13B, 44-194 Knurów', ARRAY['kuchnia wietnamska', 'duże porcje', 'na wynos'], 50.2186, 18.6629),
    ('Restauracja Zielony Ogród', 'restauracje', 'ul. Plebiscytowa 25, 44-190 Knurów', ARRAY['kuchnia polska', 'obiady', 'ogródek'], 50.2227, 18.6805),
    ('Frytkarz Knurów', 'restauracje', 'ul. Jana Kilińskiego 1C, 44-193 Knurów', ARRAY['Szczygłowice', 'frytki belgijskie', 'fast-food'], 50.1976, 18.6435),
    ('Ice Pub Szczygłowice', 'restauracje', 'ul. Hugona Kołłątaja 2, 44-193 Knurów', ARRAY['Szczygłowice', 'pub', 'imprezy'], 50.1965, 18.6406),
    ('Ferlo Bake and Sweet', 'kawiarnie', 'ul. Kosmonautów 23B, 44-194 Knurów', ARRAY['cukiernia', 'kawiarnia', 'lody'], 50.2180, 18.6628),
    ('LOVA (Lody Rzemieślnicze, Gofry, Kawa)', 'kawiarnie', 'ul. Kapelanów Wojskowych 2C, 44-194 Knurów', ARRAY['lody rzemieślnicze', 'gofry', 'kawa'], 50.2192, 18.6620),
    ('Cukiernia „U Sebusia”', 'kawiarnie', 'ul. Kazimierza Wielkiego 20A, 44-194 Knurów', ARRAY['cukiernia', 'ciasta', 'torty'], 50.2185, 18.6612),
    ('Piekarnia i Cukiernia „U Zbyszka”', 'kawiarnie', 'ul. 1 Maja 59, 44-190 Knurów', ARRAY['piekarnia', 'cukiernia', 'lody'], 50.2265, 18.6752),
    ('Art Cafe (ART CK)', 'kawiarnie', 'ul. Wincentego Witosa 6, 44-196 Knurów', ARRAY['kawiarnia', 'kultura', 'centrum'], 50.2170, 18.6587),
    ('Pracownia Coś Słodkiego', 'kawiarnie', 'ul. Armii Krajowej 1, 44-190 Knurów', ARRAY['cukiernia', 'torty artystyczne', 'desery'], 50.2243, 18.6716),
    ('Słodki Domek', 'kawiarnie', 'ul. Szpitalna 1, 44-190 Knurów', ARRAY['lody rzemieślnicze', 'kawiarnia', 'centrum'], 50.2225, 18.6703),
    ('Stokrotka Market – ul. Jedności Narodowej 1A', 'markety', 'ul. Jedności Narodowej 1A, 44-194 Knurów', ARRAY['supermarket', 'zakupy', 'osiedle'], 50.2197, 18.6598),
    ('Stokrotka Supermarket – ul. Staszica 2', 'markety', 'ul. Stanisława Staszica 2, 44-193 Knurów', ARRAY['Szczygłowice', 'supermarket', 'zakupy'], 50.1962, 18.6395),
    ('Apteka Św. Barbary (całodobowa)', 'inne', 'ul. ks. Alojzego Koziełka 8, 44-190 Knurów', ARRAY['apteka', 'całodobowa', 'centrum'], 50.2224, 18.6718),
    ('Stacja Paliw BP Knurów', 'inne', 'ul. 1 Maja 55, 44-190 Knurów', ARRAY['stacja paliw', 'myjnia', 'kawa Wild Bean'], 50.2261, 18.6748),
    ('Stacja Paliw ORLEN Knurów', 'inne', 'ul. 1 Maja 9, 44-190 Knurów', ARRAY['stacja paliw', 'samoobsługowa', 'centrum'], 50.2231, 18.6716)
) AS v(name, category, address, tags, lat, lng)
WHERE NOT EXISTS (
  SELECT 1 FROM public.places p WHERE lower(p.name) = lower(v.name)
);
