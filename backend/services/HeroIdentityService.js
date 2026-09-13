const HERO_NAME_ALIASES = Object.freeze({
  dmon: 'd.mon',
  dva: 'd.va',
  freja: '弗蕾娅',
  '弗雷娅': '弗蕾娅',
  brigitte: '布丽吉塔',
  '布里吉塔': '布丽吉塔'
});

const heroNameKey = value => {
  const key = String(value || '').trim().toLowerCase();
  return HERO_NAME_ALIASES[key] || key;
};

// The admin catalog owns hero creation and roles. Unknown source identities remain
// in player_hero_stats with a null FK, retaining their source name, slug and metrics.
const resolveExistingHero = async (name, caches, transaction, externalId = null) => {
  let hero = externalId ? caches.heroByExternalId.get(heroNameKey(externalId)) : null;
  hero ||= caches.heroByName.get(heroNameKey(name));
  hero ||= externalId ? caches.heroByName.get(heroNameKey(externalId)) : null;
  if (!hero) {
    const key = heroNameKey(externalId || name);
    caches.unknownHeroes ||= new Set();
    if (key && !caches.unknownHeroes.has(key)) {
      caches.unknownHeroes.add(key);
      console.warn('[match-sync] Unregistered hero; source statistics retained without a catalog link:', { name, externalId });
    }
    return null;
  }
  if (externalId && !hero.externalId) {
    await hero.update({ externalId }, { transaction });
    caches.heroByExternalId.set(heroNameKey(externalId), hero);
  }
  return hero;
};

module.exports = { HERO_NAME_ALIASES, heroNameKey, resolveExistingHero };
