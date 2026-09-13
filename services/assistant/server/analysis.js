import { z } from "zod";
export const metrics = [
  "eliminations",
  "assists",
  "deaths",
  "damage",
  "healing",
  "damage_mitigated",
  "final_blows",
  "ultimates_used",
];
export const analysisSchema = z
  .object({
    dataset_id: z.string(),
    group_by: z
      .array(
        z.enum([
          "player",
          "team",
          "map",
          "mode",
          "competition",
          "stage",
          "date",
          "role",
          "hero",
        ]),
      )
      .min(1)
      .max(3),
    metric: z.enum([
      ...metrics,
      "usage_seconds",
      "death_events",
      "ultimate_ready_events",
      "series_win_rate",
      "map_win_rate",
    ]),
    operation: z
      .enum(["sum", "mean", "per_10_minutes", "distribution"])
      .default("sum"),
    player_id: z.number().int().positive().optional(),
    team_id: z.number().int().positive().optional(),
    team_ids: z.array(z.number().int().positive()).max(10).optional(),
    map_id: z.number().int().positive().optional(),
    hero_id: z.number().int().positive().optional(),
    include_conflicts: z.boolean().default(false),
    min_samples: z.number().int().min(1).max(10000).default(1),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
const round = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null);
const percentile = (arr, p) => {
  if (!arr.length) return null;
  const i = (arr.length - 1) * p,
    a = Math.floor(i);
  return round(arr[a] + (arr[Math.ceil(i)] - arr[a]) * (i - a));
};
export function analyze(dataset, options) {
  const o = analysisSchema.parse(options),
    heroMode = o.group_by.includes("hero") || !!o.hero_id,
    win = o.metric.endsWith("_win_rate");
  if (
    heroMode &&
    (![
      "usage_seconds",
      "death_events",
      "ultimate_ready_events",
      "final_blows",
      "ultimates_used",
    ].includes(o.metric) ||
      win)
  )
    throw new Error(
      "接口不提供英雄级伤害、治疗、淘汰或英雄胜率；不能把整局指标分配给英雄。",
    );
  if (!heroMode && !metrics.includes(o.metric) && !win)
    throw new Error("该指标只能用于英雄明细。");
  if (
    win &&
    (!o.group_by.includes("team") ||
      o.group_by.some((k) => ["player", "hero", "role"].includes(k)) ||
      o.player_id ||
      o.hero_id)
  )
    throw new Error("胜率仅按队伍记录计算；选手和英雄归因没有可靠口径。");
  if (
    o.metric === "series_win_rate" &&
    (o.group_by.some((k) => ["map", "mode"].includes(k)) || o.map_id)
  )
    throw new Error("系列赛胜率不能按单张地图归因，请使用 map_win_rate。");
  if (
    o.operation === "per_10_minutes" &&
    (heroMode || o.group_by.includes("team"))
  )
    throw new Error(
      "每十分钟仅支持整局选手记录（个人或其样本组）；团队/英雄时长分母不同，不在此混用。",
    );
  const groups = new Map(),
    warnings = [],
    coverage = {
      matches: dataset.bundles.length,
      included_matches: 0,
      conflicting_matches: 0,
      insufficient_matches: 0,
      games: 0,
      partial_games: 0,
      missing_games: 0,
      missing_hero_records: 0,
    };
  const seen = new Set();
  function add(context, value, seconds, key) {
    if (seen.has(key)) throw new Error("数据出现重复身份，已停止聚合。");
    seen.add(key);
    const dimensions = Object.fromEntries(
      o.group_by.map((k) => [k, context[k] ?? null]),
    );
    const groupKey = JSON.stringify(
      Object.entries(dimensions).map(([k, v]) => [
        k,
        v && typeof v === "object" ? (v.id ?? v.name) : v,
      ]),
    );
    if (!groups.has(groupKey))
      groups.set(groupKey, {
        dimensions,
        values: [],
        points: [],
        missing: 0,
        seconds: 0,
        rateSum: 0,
        rateSamples: 0,
        missingDuration: 0,
        matches: new Set(),
        games: new Set(),
        refs: new Set(),
      });
    const g = groups.get(groupKey);
    g.matches.add(context.matchId);
    if (context.gameId) g.games.add(context.gameId);
    g.refs.add(context.source);
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      g.values.push(value);
      g.points.push({
        value,
        match_id: context.matchId,
        game_id: context.gameId,
        source: context.source,
      });
      if (seconds > 0) {
        g.seconds += seconds;
        g.rateSum += value;
        g.rateSamples++;
      } else g.missingDuration++;
    } else g.missing++;
  }
  for (const bundle of dataset.bundles) {
    const { match: m, result_consistency: state } = bundle;
    if (state === "conflicting") {
      coverage.conflicting_matches++;
      if (!o.include_conflicts) continue;
    }
    if (state === "insufficient_data") coverage.insufficient_matches++;
    coverage.included_matches++;
    const common = {
      competition: m.competition,
      stage: m.stage,
      date: m.date,
      matchId: m.id,
      source: bundle.source,
    };
    if (o.metric === "series_win_rate") {
      for (const side of [m.team1, m.team2])
        if ((!o.team_id || side.team.id === o.team_id) && (!o.team_ids?.length || o.team_ids.includes(side.team.id)))
          add(
            { ...common, team: side.team },
            m.winner_team_id === null
              ? null
              : m.winner_team_id === side.team.id
                ? 1
                : 0,
            null,
            `${m.id}:${side.team.id}`,
          );
      continue;
    }
    for (const { game: g, player_stats: stats } of bundle.games) {
      if (o.map_id && g.map.id !== o.map_id) continue;
      coverage.games++;
      if (g.player_stats_coverage.status === "partial")
        coverage.partial_games++;
      if (g.player_stats_coverage.status === "not_recorded")
        coverage.missing_games++;
      const context = { ...common, map: g.map, mode: g.map.mode, gameId: g.id };
      if (o.metric === "map_win_rate") {
        for (const side of [g.team1, g.team2])
          if ((!o.team_id || side.team.id === o.team_id) && (!o.team_ids?.length || o.team_ids.includes(side.team.id)))
            add(
              { ...context, team: side.team },
              g.winner_team_id === null
                ? null
                : g.winner_team_id === side.team.id
                  ? 1
                  : 0,
              null,
              `${g.id}:${side.team.id}`,
            );
        continue;
      }
      for (const p of stats) {
        if (
          (o.player_id && p.player.id !== o.player_id) ||
          (o.team_id && p.team.id !== o.team_id) ||
          (o.team_ids?.length && !o.team_ids.includes(p.team.id))
        )
          continue;
        const c = {
          ...context,
          player: p.player,
          team: p.team,
          role: p.player.role,
        };
        if (heroMode) {
          if (p.hero_stats.status === "not_recorded")
            coverage.missing_hero_records++;
          for (const h of p.hero_stats.items) {
            if (o.hero_id && h.hero.id !== o.hero_id) continue;
            add(
              { ...c, hero: h.hero },
              h.metrics[o.metric],
              null,
              `${g.id}:${p.team.id}:${p.player.id}:${h.hero.id ?? h.hero.name}`,
            );
          }
        } else
          add(
            c,
            p.metrics[o.metric],
            g.duration_seconds,
            `${g.id}:${p.team.id}:${p.player.id}`,
          );
      }
    }
  }
  if (coverage.conflicting_matches)
    warnings.push(
      `${coverage.conflicting_matches} 场系列赛比分与地图记录冲突，${o.include_conflicts ? "按明确选项纳入，结果有冲突风险" : "已排除"}。`,
    );
  if (coverage.insufficient_matches)
    warnings.push(
      `${coverage.insufficient_matches} 场地图结果信息不足；不代表完整系列赛地图样本。`,
    );
  if (coverage.partial_games || coverage.missing_games)
    warnings.push(
      `选手统计不全：${coverage.partial_games} 张地图部分记录，${coverage.missing_games} 张无记录；统计只覆盖实际返回的选手。`,
    );
  if (heroMode)
    warnings.push(
      "英雄项可能过滤不超过 30 秒的使用；结果只是已保留英雄记录，不是完整英雄池。",
    );
  if (o.group_by.includes("role"))
    warnings.push("role 为选手目录位置，不能证明该局实际职责。");
  const rows = [...groups.values()].map((g) => {
    const values = g.values.sort((a, b) => a - b),
      n = values.length,
      sum = values.reduce((a, b) => a + b, 0);
    const value = win
      ? n
        ? (sum / n) * 100
        : null
      : o.operation === "per_10_minutes"
        ? g.seconds
          ? (g.rateSum / g.seconds) * 600
          : null
        : o.operation === "distribution"
          ? percentile(values, 0.5)
          : o.operation === "mean"
            ? n
              ? sum / n
              : null
            : n
              ? sum
              : null;
    const q1 = percentile(values, 0.25),
      q3 = percentile(values, 0.75),
      iqr = q3 - q1;
    const outliers =
      n >= 4
        ? g.points.filter(
            (p) => p.value < q1 - 1.5 * iqr || p.value > q3 + 1.5 * iqr,
          )
        : [];
    return {
      dimensions: g.dimensions,
      value: round(value),
      observed_samples: n,
      missing_samples: g.missing,
      effective_samples: o.operation === "per_10_minutes" ? g.rateSamples : n,
      excluded_samples:
        g.missing + (o.operation === "per_10_minutes" ? g.missingDuration : 0),
      matches: g.matches.size,
      games: g.games.size,
      known_sum: n ? round(sum) : null,
      rate_samples:
        o.operation === "per_10_minutes" ? g.rateSamples : undefined,
      rate_seconds: o.operation === "per_10_minutes" ? g.seconds : undefined,
      missing_duration:
        o.operation === "per_10_minutes" ? g.missingDuration : undefined,
      ...(o.operation === "distribution"
        ? {
            min: values[0] ?? null,
            p25: q1,
            median: percentile(values, 0.5),
            p75: q3,
            max: values.at(-1) ?? null,
            outlier_rule:
              n >= 4
                ? "1.5 IQR on observed raw metric; descriptive only"
                : "insufficient samples for IQR",
            outlier_count: outliers.length,
            outlier_examples: outliers.slice(0, 10),
          }
        : {}),
      sources: [...g.refs],
    };
  });
  if (o.operation === "per_10_minutes") {
    const missingDuration = rows.reduce(
      (count, row) => count + row.missing_duration,
      0,
    );
    if (missingDuration)
      warnings.push(
        `${missingDuration} 条指标已知但缺少有效地图时长的记录未参与每十分钟计算，也不计入最少有效样本数。`,
      );
  }
  const eligible = rows
    .filter((r) => r.effective_samples >= o.min_samples)
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return {
    metric: o.metric,
    operation: win ? "known_winners_percentage" : o.operation,
    unit: win
      ? "percent"
      : o.operation === "per_10_minutes"
        ? "per_10_minutes"
        : "recorded_metric",
    scope: dataset.filters,
    group_by: o.group_by,
    analysis_filters: {
      player_id: o.player_id,
      team_id: o.team_id,
      team_ids: o.team_ids,
      map_id: o.map_id,
      hero_id: o.hero_id,
      include_conflicts: o.include_conflicts,
      min_samples: o.min_samples,
    },
    coverage,
    groups_total: rows.length,
    groups_eligible: eligible.length,
    groups_returned: Math.min(o.limit, eligible.length),
    excluded_by_min_samples: rows.length - eligible.length,
    sample_basis:
      o.operation === "per_10_minutes"
        ? "metric and positive map duration both known"
        : "metric known",
    rows: eligible.slice(0, o.limit),
    missing_only_groups: rows
      .filter((r) => r.observed_samples === 0)
      .map((r) => ({
        dimensions: r.dimensions,
        missing_samples: r.missing_samples,
      }))
      .slice(0, 50),
    warnings: [
      ...warnings,
      "仅针对已收录并成功读取的范围；样本排名或相关差异不证明强弱因果。",
    ],
    period: dataset.period,
    completeness:
      "All selected API matches loaded; not a global time-consistent snapshot or official full-event guarantee.",
  };
}
