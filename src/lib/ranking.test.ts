import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANONYMOUS_AUTHOR_NAME,
  calculateBayesScore,
  calculateGlobalMean,
  checkUserRateLimit,
  formatPolishVotes,
  normalizePlaceCategory,
  rankPlaces,
  resolveReviewAuthor,
  validatePlaceInput,
  validateReviewInput,
  type Place,
  type Review,
} from './ranking';

test('normalizePlaceCategory poprawnie rozdziela starszą kategorię sklepy na Żabka/Lidl/Biedronka', () => {
  assert.equal(normalizePlaceCategory('sklepy', 'Lidl Knurów – Szpitalna 37a'), 'lidl');
  assert.equal(normalizePlaceCategory('sklepy', 'Żabka – ul. 1 Maja 7'), 'zabka');
  assert.equal(normalizePlaceCategory('sklepy', 'Biedronka – Dworcowa 64'), 'biedronka');
  assert.equal(normalizePlaceCategory('fryzjer', 'Salon Fryzjerski Lila'), 'fryzjer');
  assert.equal(normalizePlaceCategory('inne_legacy', 'Orlik MOSiR Knurów'), 'boiska');
  assert.equal(normalizePlaceCategory('inne_legacy', 'Xtreme Fitness Knurów'), 'silownie');
});

test('formatPolishVotes poprawnie odmienia liczebniki polskie', () => {
  assert.equal(formatPolishVotes(0), '0 głosów');
  assert.equal(formatPolishVotes(1), '1 głos');
  assert.equal(formatPolishVotes(2), '2 głosy');
  assert.equal(formatPolishVotes(4), '4 głosy');
  assert.equal(formatPolishVotes(5), '5 głosów');
  assert.equal(formatPolishVotes(12), '12 głosów');
  assert.equal(formatPolishVotes(22), '22 głosy');
});

const basePlaces: Place[] = [
  {
    id: 'p1',
    name: 'Lokal z wieloma opiniami',
    category: 'kebab',
    address: 'ul. Szpitalna 10, Knurów',
    tags: ['płatność kartą'],
    lat: 50.222,
    lng: 18.671,
    createdAt: '2026-01-01T10:00:00Z',
  },
  {
    id: 'p2',
    name: 'Nowy lokal z 1 oceną 10/10',
    category: 'kebab',
    address: 'ul. Dworcowa 2, Knurów',
    tags: ['nowość'],
    lat: 50.224,
    lng: 18.675,
    createdAt: '2026-01-02T10:00:00Z',
  },
];

test('algorytm Bayesa zapobiega wyprzedzeniu lokalu ze 100 ocenami 9.2 przez lokal z 1 oceną 10.0', () => {
  const globalMean = 7.0;
  const manyVotesScore = calculateBayesScore(9.2, 100, globalMean, 10);
  const oneVoteScore = calculateBayesScore(10.0, 1, globalMean, 10);

  assert.ok(manyVotesScore > oneVoteScore);
  assert.equal(manyVotesScore, 9.0);
  assert.equal(oneVoteScore, 7.27);
});

test('rankPlaces poprawnie sortuje i wylicza isProvisional poniżej m=10', () => {
  const placesWithBaseline: Place[] = [
    ...basePlaces,
    {
      id: 'p3',
      name: 'Przeciętny punkt',
      category: 'inne',
      address: 'ul. 1 Maja 1, Knurów',
      tags: [],
      lat: 50.222,
      lng: 18.671,
      createdAt: '2026-01-03T10:00:00Z',
    },
  ];
  const reviews: Review[] = [];
  for (let i = 0; i < 15; i++) {
    reviews.push({
      id: `r-p1-${i}`,
      placeId: 'p1',
      userId: `u-${i}`,
      authorName: `User ${i}`,
      authorAvatar: '',
      rating: 9,
      comment: 'Świetny lokal w Knurowie!',
      isLocalVerified: true,
      distanceKm: 1.2,
      createdAt: '2026-06-01T12:00:00Z',
    });
  }
  for (let i = 0; i < 15; i++) {
    reviews.push({
      id: `r-p3-${i}`,
      placeId: 'p3',
      userId: `u-b-${i}`,
      authorName: `User B ${i}`,
      authorAvatar: '',
      rating: 6,
      comment: 'Średni poziom usług.',
      isLocalVerified: true,
      distanceKm: 1.4,
      createdAt: '2026-06-01T12:00:00Z',
    });
  }
  reviews.push({
    id: 'r-p2-1',
    placeId: 'p2',
    userId: 'u-solo',
    authorName: 'Solo',
    authorAvatar: '',
    rating: 10,
    comment: 'Super!',
    isLocalVerified: true,
    distanceKm: 0.5,
    createdAt: '2026-06-02T12:00:00Z',
  });

  const ranked = rankPlaces(placesWithBaseline, reviews);
  assert.equal(ranked[0].id, 'p1');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].isProvisional, false);
  assert.equal(ranked[1].id, 'p2');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[1].isProvisional, true);
});

test('calculateGlobalMean zwraca 7.0 gdy brak opinii', () => {
  assert.equal(calculateGlobalMean([]), 7.0);
});

test('rate limiting blokuje 4. nową opinię w ciągu 24 godzin', () => {
  const now = new Date('2026-10-10T12:00:00Z').getTime();
  const reviews: Review[] = [
    {
      id: '1',
      placeId: 'p1',
      userId: 'u1',
      authorName: 'A',
      authorAvatar: '',
      rating: 8,
      comment: 'OK 1',
      isLocalVerified: true,
      distanceKm: 1,
      createdAt: '2026-10-10T01:00:00Z',
    },
    {
      id: '2',
      placeId: 'p2',
      userId: 'u1',
      authorName: 'A',
      authorAvatar: '',
      rating: 9,
      comment: 'OK 2',
      isLocalVerified: true,
      distanceKm: 1,
      createdAt: '2026-10-10T03:00:00Z',
    },
    {
      id: '3',
      placeId: 'p3',
      userId: 'u1',
      authorName: 'A',
      authorAvatar: '',
      rating: 7,
      comment: 'OK 3',
      isLocalVerified: true,
      distanceKm: 1,
      createdAt: '2026-10-10T06:00:00Z',
    },
  ];

  const blocked = checkUserRateLimit(reviews, 'u1', now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.countLast24h, 3);

  const otherUser = checkUserRateLimit(reviews, 'u2', now);
  assert.equal(otherUser.allowed, true);
  assert.equal(otherUser.remaining, 3);
});

test('walidacja opinii i nowego lokalu odrzuca błędne dane', () => {
  assert.equal(validateReviewInput(11, 'Za wysoka').valid, false);
  assert.equal(validateReviewInput(8, 'ab').valid, false);
  assert.equal(validateReviewInput(9, 'Bardzo smacznie i szybko').valid, true);

  assert.equal(validatePlaceInput('A', 'kebab', 'ul. Szpitalna 1').valid, false);
  assert.equal(validatePlaceInput('Nowy Lokal', 'invalid' as string, 'ul. Szpitalna 1').valid, false);
  assert.equal(validatePlaceInput('Nowy Lokal', 'barber', 'ul. Kosmonautów 5, Knurów').valid, true);
});

test('resolveReviewAuthor pozwala niezależnie ukryć nazwę oraz zdjęcie profilowe', () => {
  const onlyNameHidden = resolveReviewAuthor('Jan Kowalski', 'https://example.com/a.jpg', {
    hideName: true,
    hideAvatar: false,
  });
  assert.equal(onlyNameHidden.authorName, ANONYMOUS_AUTHOR_NAME);
  assert.equal(onlyNameHidden.authorAvatar, 'https://example.com/a.jpg');
  assert.equal(onlyNameHidden.isNameHidden, true);
  assert.equal(onlyNameHidden.isAvatarHidden, false);

  const onlyAvatarHidden = resolveReviewAuthor('Jan Kowalski', 'https://example.com/a.jpg', {
    hideName: false,
    hideAvatar: true,
  });
  assert.equal(onlyAvatarHidden.authorName, 'Jan Kowalski');
  assert.equal(onlyAvatarHidden.authorAvatar, '');
  assert.equal(onlyAvatarHidden.isNameHidden, false);
  assert.equal(onlyAvatarHidden.isAvatarHidden, true);

  const bothHidden = resolveReviewAuthor('Jan Kowalski', 'https://example.com/a.jpg', {
    hideName: true,
    hideAvatar: true,
  });
  assert.equal(bothHidden.authorName, ANONYMOUS_AUTHOR_NAME);
  assert.equal(bothHidden.authorAvatar, '');

  const bothVisible = resolveReviewAuthor('Jan Kowalski', 'https://example.com/a.jpg', {
    hideName: false,
    hideAvatar: false,
  });
  assert.equal(bothVisible.authorName, 'Jan Kowalski');
  assert.equal(bothVisible.authorAvatar, 'https://example.com/a.jpg');
});
