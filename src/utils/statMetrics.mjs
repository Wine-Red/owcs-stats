// Public aggregate gameTime/totalDuration/profile totals.duration are minutes.
// Hero usageSeconds and timeline timestamps must be converted by their callers.
const number = value => Number(value) || 0;
const rounded = (value, digits) => digits === undefined ? value : Number(value.toFixed(digits));

export const perMinute = (total, durationMinutes) => number(durationMinutes) > 0 ? number(total) / number(durationMinutes) : 0;
export const perTenMinutes = (total, durationMinutes, digits) => rounded(perMinute(total, durationMinutes) * 10, digits);
export const killDeathRatio = (kills, deaths, digits) => rounded(number(deaths) > 0 ? number(kills) / number(deaths) : number(kills), digits);
export const killAssistDeathRatio = (kills, assists, deaths, digits) => killDeathRatio(number(kills) + number(assists), deaths, digits);

export const profileTotalsStat = (totals, role) => totals ? {
  role,
  gameTime: number(totals.duration),
  elims: totals.kills,
  deaths: totals.deaths,
  assists: totals.assists,
  damage: totals.damage,
  healing: totals.healing,
  mitigation: totals.mitigation
} : null;
