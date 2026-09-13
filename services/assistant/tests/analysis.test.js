import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../server/analysis.js";
const ref = (id, name) => ({ id, name });
export const sample = () => ({
  filters: { competition_id: 1 },
  period: {
    started_at: "2026-09-11T00:00:00Z",
    finished_at: "2026-09-11T00:01:00Z",
  },
  bundles: [
    {
      source: "S1",
      result_consistency: "consistent",
      match: {
        id: 1,
        competition: ref(1, "Cup"),
        stage: null,
        date: "2026-09-10",
        team1: { team: ref(1, "A") },
        team2: { team: ref(2, "B") },
        winner_team_id: 1,
      },
      games: [
        {
          game: {
            id: 11,
            map: { ...ref(1, "Map"), mode: "control" },
            duration_seconds: 600,
            team1: { team: ref(1, "A") },
            team2: { team: ref(2, "B") },
            winner_team_id: 1,
            player_stats_coverage: { status: "partial" },
          },
          player_stats: [
            {
              team: ref(1, "A"),
              player: { ...ref(1, "Same"), role: "damage" },
              metrics: { damage: 0, final_blows: null },
              hero_stats: { status: "not_recorded", items: [] },
            },
            {
              team: ref(2, "B"),
              player: { ...ref(2, "Same"), role: "damage" },
              metrics: { damage: 200, final_blows: null },
              hero_stats: {
                status: "recorded",
                items: [
                  {
                    hero: ref(1, "Hero"),
                    metrics: { usage_seconds: 100, final_blows: 3 },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
});
const options = { dataset_id: "D1", group_by: ["player"], metric: "damage" };
test("zero is observed; null is not zero; same-name players remain separate", () => {
  const r = analyze(sample(), options);
  assert.equal(r.groups_total, 2);
  assert.equal(r.rows[1].value, 0);
  const missing = analyze(sample(), { ...options, metric: "final_blows" });
  assert.equal(missing.rows.length, 0);
  assert.equal(missing.missing_only_groups.length, 2);
  assert.equal(missing.missing_only_groups[0].missing_samples, 1);
});
test("conflicting matches excluded explicitly, not repaired; partial coverage preserved", () => {
  const d = sample();
  d.bundles[0].result_consistency = "conflicting";
  const r = analyze(d, options);
  assert.equal(r.coverage.conflicting_matches, 1);
  assert.equal(r.rows.length, 0);
  const kept = analyze(d, { ...options, include_conflicts: true });
  assert.equal(kept.coverage.partial_games, 1);
  assert.equal(kept.rows.length, 2);
});
test("per-ten denominator includes only known metric with positive duration", () => {
  const d = sample();
  const second = structuredClone(d.bundles[0]);
  second.match.id = 2;
  second.games[0].game.id = 12;
  second.games[0].game.duration_seconds = null;
  second.games[0].player_stats[1].metrics.damage = 400;
  d.bundles.push(second);
  const r = analyze(d, { ...options, operation: "per_10_minutes" });
  assert.equal(r.rows[0].value, 200);
  assert.equal(r.rows[0].rate_seconds, 600);
  assert.equal(r.rows[0].missing_duration, 1);
  assert.equal(r.rows[0].known_sum, 600);
  assert.equal(r.rows[0].observed_samples, 2);
  assert.equal(r.rows[0].effective_samples, 1);
  assert.equal(r.rows[0].excluded_samples, 1);
  const minimumTwo = analyze(d, {
    ...options,
    operation: "per_10_minutes",
    min_samples: 2,
  });
  assert.equal(minimumTwo.rows.length, 0);
  assert.equal(minimumTwo.excluded_by_min_samples, 2);
  assert.ok(
    minimumTwo.warnings.some((w) => w.includes("不计入最少有效样本数")),
  );
  assert.equal(
    analyze(d, { ...options, operation: "sum", min_samples: 2 }).rows.length,
    2,
  );
});
test("hero damage and hero win rate are rejected rather than allocated", () => {
  assert.throws(
    () => analyze(sample(), { ...options, group_by: ["hero"] }),
    /英雄级/,
  );
  assert.throws(
    () =>
      analyze(sample(), {
        ...options,
        group_by: ["hero"],
        metric: "map_win_rate",
      }),
    /英雄级/,
  );
  const r = analyze(sample(), {
    ...options,
    group_by: ["hero"],
    metric: "usage_seconds",
  });
  assert.equal(r.rows[0].value, 100);
  assert.equal(r.coverage.missing_hero_records, 1);
});
test("map victories use winner field; series cannot be attributed to a map", () => {
  const r = analyze(sample(), {
    ...options,
    group_by: ["team", "map"],
    metric: "map_win_rate",
  });
  assert.equal(r.rows[0].value, 100);
  assert.equal(r.rows[1].value, 0);
  assert.throws(
    () =>
      analyze(sample(), {
        ...options,
        group_by: ["team", "map"],
        metric: "series_win_rate",
      }),
    /系列赛/,
  );
});
test("duplicate identity halts aggregation", () => {
  const d = sample();
  d.bundles[0].games[0].player_stats.push(
    d.bundles[0].games[0].player_stats[0],
  );
  assert.throws(() => analyze(d, options), /重复/);
});
test("descriptive outliers retain the original match and source rather than imply cheating", () => {
  const d = sample();
  d.bundles = [10, 10, 10, 1000].map((damage, i) => {
    const b = structuredClone(d.bundles[0]);
    b.match.id = i + 1;
    b.games[0].game.id = i + 11;
    b.games[0].player_stats[0].metrics.damage = damage;
    return b;
  });
  const r = analyze(d, { ...options, operation: "distribution", player_id: 1 });
  assert.equal(r.rows[0].median, 10);
  assert.equal(r.rows[0].outlier_count, 1);
  assert.equal(r.rows[0].outlier_examples[0].match_id, 4);
  assert.equal(r.rows[0].outlier_examples[0].source, "S1");
  const ranked = analyze(d, { ...options, operation: "distribution" });
  // The 200-per-game player has a higher median than [10,10,10,1000],
  // despite the latter's larger sum. Rank the value shown to the user.
  assert.deepEqual(
    ranked.rows.map((row) => row.dimensions.player.id),
    [2, 1],
  );
  assert.deepEqual(
    ranked.rows.map((row) => row.value),
    [200, 10],
  );
});
