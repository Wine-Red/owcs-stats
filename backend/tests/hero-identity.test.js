const test = require('node:test');
const assert = require('node:assert/strict');
const { heroNameKey, resolveExistingHero } = require('../services/HeroIdentityService');

const cache = heroes => ({
  heroByName: new Map(heroes.map(hero => [heroNameKey(hero.name), hero])),
  heroByExternalId: new Map(heroes.filter(hero => hero.externalId).map(hero => [heroNameKey(hero.externalId), hero]))
});

test('legacy names, canonical names and source slugs resolve to the existing catalog identity', async () => {
  for (const [name, alias, externalId, role] of [
    ['弗蕾娅', '弗雷娅', 'freja', 'damage'], ['布丽吉塔', '布里吉塔', 'brigitte', 'support']
  ]) {
    const hero = { id: 34, name, externalId, role };
    const caches = cache([hero]);
    for (const value of [name, alias, externalId, ` ${externalId.toUpperCase()} `]) {
      assert.equal(await resolveExistingHero(value, caches), hero);
    }
    assert.equal(await resolveExistingHero('a different display name', caches, null, externalId), hero);
    assert.equal(hero.role, role);
  }
});

test('a known legacy hero can acquire its stable slug without changing its catalog metadata', async () => {
  const transaction = {};
  const hero = { id: 46, name: '布里吉塔', role: 'support', image: '/existing.webp', externalId: null,
    async update(patch, options) {
      assert.equal(options.transaction, transaction);
      assert.deepEqual(patch, { externalId: 'brigitte' });
      Object.assign(this, patch);
    } };
  const caches = cache([hero]);
  assert.equal(await resolveExistingHero('布丽吉塔', caches, transaction, 'brigitte'), hero);
  assert.equal(caches.heroByExternalId.get(heroNameKey('brigitte')), hero);
  assert.equal(hero.role, 'support');
  assert.equal(hero.image, '/existing.webp');
});

test('unregistered heroes do not mutate the catalog and are reported once per match cache', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const caches = cache([]);
  for (let index = 0; index < 2; index++) {
    assert.equal(await resolveExistingHero('Future Hero', caches, null, 'future-hero'), null);
  }
  assert.equal(caches.heroByName.size, 0);
  assert.equal(caches.heroByExternalId.size, 0);
  assert.equal(warn.mock.callCount(), 1);
});
