const METRICS = Object.freeze({
  player: Object.freeze({
    kills: { label: '击杀', source: 'kills' },
    assists: { label: '助攻', source: 'assists' },
    deaths: { label: '阵亡', source: 'deaths' },
    damage: { label: '伤害', source: 'damage' },
    healing: { label: '治疗', source: 'healing' },
    mitigation: { label: '承伤减免', source: 'mitigation' },
    final_blows: { label: '最后一击', source: 'finalBlows' },
    kills_per_10: { label: '每10分钟击杀', source: 'kills', per10: true },
    assists_per_10: { label: '每10分钟助攻', source: 'assists', per10: true },
    deaths_per_10: { label: '每10分钟阵亡', source: 'deaths', per10: true },
    damage_per_10: { label: '每10分钟伤害', source: 'damage', per10: true },
    healing_per_10: { label: '每10分钟治疗', source: 'healing', per10: true },
    mitigation_per_10: { label: '每10分钟承伤减免', source: 'mitigation', per10: true },
    final_blows_per_10: { label: '每10分钟最后一击', source: 'finalBlows', per10: true },
    kd: { label: '击杀阵亡比', calculated: 'kd' },
    kad: { label: 'KAD', calculated: 'kad' },
    maps_played: { label: '出场地图数', calculated: 'mapsPlayed' },
    minutes_played: { label: '出场分钟数', calculated: 'minutesPlayed' }
  }),
  team: Object.freeze({
    matches_played: { label: '比赛场次', calculated: 'matchesPlayed' },
    match_wins: { label: '比赛胜场', calculated: 'matchWins' },
    match_losses: { label: '比赛负场', calculated: 'matchLosses' },
    match_win_rate: { label: '比赛胜率', calculated: 'matchWinRate' },
    map_wins: { label: '地图胜场', calculated: 'mapWins' },
    map_losses: { label: '地图负场', calculated: 'mapLosses' },
    map_win_rate: { label: '地图胜率', calculated: 'mapWinRate' },
    map_differential: { label: '地图净胜分', calculated: 'mapDifferential' }
  }),
  map: Object.freeze({
    map_pick_count: { label: '地图出场次数', calculated: 'pickCount' },
    map_win_rate: { label: '指定战队地图胜率', calculated: 'teamWinRate', requiresTeam: true }
  }),
  hero: Object.freeze({
    hero_usage_seconds: { label: '英雄使用时长', calculated: 'usageSeconds' },
    hero_usage_rate: { label: '英雄使用占比', calculated: 'usageRate' },
    hero_final_blows: { label: '英雄最后一击', calculated: 'finalBlows' },
    hero_final_blows_per_10: { label: '英雄每10分钟最后一击', calculated: 'finalBlowsPer10' },
    avg_ult_charge_seconds: { label: '平均大招充能时间', calculated: 'avgUltChargeSeconds' },
    hero_bans: { label: '英雄禁用次数', calculated: 'banCount' }
  }),
  match: Object.freeze({
    match_score: { label: '比赛结果', calculated: 'score' }
  })
});

const SUBJECTS = Object.freeze(Object.keys(METRICS));
const ALL_METRIC_NAMES = Object.freeze([...new Set(SUBJECTS.flatMap(subject => Object.keys(METRICS[subject])))].sort());
const metricNames = subject => Object.keys(METRICS[subject] || {});
const hasMetric = (subject, metric) => Boolean(METRICS[subject]?.[metric]);
const getMetric = (subject, metric) => METRICS[subject]?.[metric] || null;

const promptCatalog = () => SUBJECTS.map(subject => (
  `${subject}: ${Object.entries(METRICS[subject]).map(([key, value]) => `${key}(${value.label})`).join(', ')}`
)).join('\n');

module.exports = { METRICS, SUBJECTS, ALL_METRIC_NAMES, metricNames, hasMetric, getMetric, promptCatalog };
