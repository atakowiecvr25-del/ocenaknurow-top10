import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackAdminDashboard,
  formatShortDevice,
  isAdminEmail,
} from './admin';
import type { RankedPlace } from './ranking';

test('isAdminEmail akceptuje wyłącznie adres administratora niezależnie od wielkości liter', () => {
  assert.equal(isAdminEmail('atakowiecvr25@gmail.com'), true);
  assert.equal(isAdminEmail('  AtakowiecVR25@gmail.com '), true);
  assert.equal(isAdminEmail('mieszkaniec@gmail.com'), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(''), false);
});

test('buildFallbackAdminDashboard zlicza nowe opinie, konta oraz zgłoszone lokale', () => {
  const now = new Date('2026-11-15T12:00:00Z').getTime();
  const samplePlaces: RankedPlace[] = [
    {
      id: 'p1',
      name: 'Gym City Knurów',
      category: 'silownie',
      address: 'ul. 1 Maja 74, Knurów',
      tags: ['siłownia'],
      lat: 50.2278,
      lng: 18.6764,
      createdAt: '2026-11-14T10:00:00Z',
      createdBy: 'user-1',
      rank: 1,
      bayesScore: 8.5,
      rawAverage: 9.0,
      totalVotes: 2,
      verifiedVotes: 2,
      isProvisional: true,
      ratingDistribution: [0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
      reviews: [
        {
          id: 'r1',
          placeId: 'p1',
          userId: 'user-1',
          authorName: 'Anonimowy mieszkaniec',
          authorAvatar: '',
          rating: 10,
          comment: 'Świetny sprzęt!',
          isLocalVerified: true,
          distanceKm: 1.2,
          createdAt: '2026-11-15T10:00:00Z',
        },
        {
          id: 'r2',
          placeId: 'p1',
          userId: 'user-2',
          authorName: 'Kamil',
          authorAvatar: '',
          rating: 8,
          comment: 'Dobra siłownia.',
          isLocalVerified: true,
          distanceKm: 0.9,
          createdAt: '2026-11-10T10:00:00Z',
          updatedAt: '2026-11-13T10:00:00Z',
        },
      ],
    },
  ];

  const dashboard = buildFallbackAdminDashboard(samplePlaces, now);

  assert.equal(dashboard.stats.totalUsers, 2);
  assert.equal(dashboard.stats.activeUsers24h, 1);
  assert.equal(dashboard.stats.activeUsers7d, 2);
  assert.equal(dashboard.stats.totalReviews, 2);
  assert.equal(dashboard.stats.reviews24h, 1);
  assert.equal(dashboard.stats.reviews7d, 2);
  assert.equal(dashboard.stats.communityPlacesCount, 1);
  assert.equal(dashboard.recentReviews[0].id, 'r1');
  assert.equal(dashboard.recentReviews[1].isEdited, true);
  assert.equal(dashboard.communityPlaces[0].name, 'Gym City Knurów');
});

test('formatShortDevice rozpoznaje system i przeglądarkę z User-Agent', () => {
  assert.equal(
    formatShortDevice(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'
    ),
    'Chrome · Windows'
  );
  assert.equal(
    formatShortDevice(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    ),
    'Safari · iOS'
  );
  assert.equal(formatShortDevice(''), '');
});
