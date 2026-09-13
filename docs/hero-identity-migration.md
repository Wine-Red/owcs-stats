# Hero catalog identities

Match synchronization resolves existing heroes by stable external ID or compatible
display names. It never creates a hero or assigns a hero role from a player's role.
Unregistered heroes retain their name, source ID and numerical statistics in
`player_hero_stats` with `heroId = NULL`; the sync log reports the missing identity.
After registering a hero in the admin catalog, resynchronize the affected match to
associate those statistics. Older Chinese spellings remain supported for bans,
statistics and fallback images.

The one-time September 2026 migration preserves IDs 34 and 46, their roles,
subroles and managed images. It merges 55 into 34 (弗蕾娅 / freja) and 54 into 46
(布丽吉塔 / brigitte), preserving every statistic and ban reference. Source
timelines remain unchanged.

Preview against the explicitly selected database:

```sh
node backend/scripts/merge-hero-identities.js --database owcs_stats
```

Apply with a new backup file on persistent storage:

```sh
node backend/scripts/merge-hero-identities.js --database owcs_stats --apply --backup /backup/hero-identities-before.json
```

The script verifies the expected record identities and foreign keys, locks affected
records, writes the backup before any updates, and compares every affected row
before committing. Ambiguous overlapping statistics abort without combining
metrics. Reruns are safe. Backups contain all original hero records and affected
statistics/map rows; restoration must run in a transaction after checking for any
newer source writes. The migration is deliberately separate from app startup.
