import axios from 'axios';

// 创建axios实例
const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 增加到 60 秒以支持耗时的同步和 AI 操作
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
api.interceptors.request.use(
  config => {
    // 可以在这里添加认证token
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  response => {
    return response.data;
  },
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// API服务
const apiService = {
  // 赛季相关
  getSeasons: () => api.get('/seasons'),
  getSeasonById: (id) => api.get(`/seasons/${id}`),
  createSeason: (data) => api.post('/seasons', data),
  updateSeason: (id, data) => api.put(`/seasons/${id}`, data),
  deleteSeason: (id) => api.delete(`/seasons/${id}`),
  getSeasonDeletePreview: (id) => api.get(`/seasons/${id}/pre-delete-check`),

  // 队伍相关
  getTeams: () => api.get('/teams'),
  getTeamById: (id) => api.get(`/teams/${id}`),
  createTeam: (data) => api.post('/teams', data),
  updateTeam: (id, data) => api.put(`/teams/${id}`, data),
  deleteTeam: (id) => api.delete(`/teams/${id}`),
  getTeamPlayers: (teamId) => api.get(`/teams/${teamId}/players`),

  // 选手相关
  getPlayers: () => api.get('/players'),
  getPlayerById: (id) => api.get(`/players/${id}`),
  createPlayer: (data) => api.post('/players', data),
  updatePlayer: (id, data) => api.put(`/players/${id}`, data),
  deletePlayer: (id) => api.delete(`/players/${id}`),

  // 地图相关
  getMaps: () => api.get('/maps'),
  getMapById: (id) => api.get(`/maps/${id}`),
  createMap: (data) => api.post('/maps', data),
  updateMap: (id, data) => api.put(`/maps/${id}`, data),
  deleteMap: (id) => api.delete(`/maps/${id}`),

  // 英雄相关
  getHeroes: () => api.get('/heroes'),
  getHeroById: (id) => api.get(`/heroes/${id}`),
  createHero: (data) => api.post('/heroes', data),
  updateHero: (id, data) => api.put(`/heroes/${id}`, data),
  deleteHero: (id) => api.delete(`/heroes/${id}`),

  // 比赛相关
  getUpcomingMatches: () => api.get('/matches/upcoming'),
  getMatches: (filters) => api.get('/matches', { params: filters }),
  getMatchById: (id) => api.get(`/matches/${id}`),
  createMatch: (data) => api.post('/matches', data),
  updateMatch: (id, data) => api.put(`/matches/${id}`, data),
  deleteMatch: (id) => api.delete(`/matches/${id}`),
  getMatchMapGames: (matchId) => api.get(`/matches/${matchId}/map-games`),
  syncExternalMatches: () => api.post('/matches/sync-external'),
  exportMatches: (matchIds) => api.post('/matches/export', { matchIds }, { responseType: 'blob' }),

  // 地图局相关
  getMapGames: (filters) => api.get('/map-games', { params: filters }),
  getMapGameById: (id) => api.get(`/map-games/${id}`),
  getMapGameEditContext: (id) => api.get(`/map-games/${id}/edit-context`),
  createMapGame: (data) => api.post('/map-games', data),
  updateMapGame: (id, data) => api.put(`/map-games/${id}`, data),
  deleteMapGame: (id) => api.delete(`/map-games/${id}`),
  getMapGamePlayerStats: (mapGameId) => api.get(`/map-games/${mapGameId}/player-stats`),
  importMapData: (data) => api.post('/map-games/import', data),
  previewMapData: (data) => api.post('/map-games/preview', data),

  // 选手统计数据相关
  getPlayerStats: () => api.get('/player-stats'),
  getPlayerStatById: (id) => api.get(`/player-stats/${id}`),
  createPlayerStat: (data) => api.post('/player-stats', data),
  updatePlayerStat: (id, data) => api.put(`/player-stats/${id}`, data),
  deletePlayerStat: (id) => api.delete(`/player-stats/${id}`),

  // 统计数据相关
  getPlayerStatsData: (params) => api.get('/stats/player', { params }),
  getTeamStatsData: (params) => api.get('/stats/team', { params }),
  getSeasonStatsData: (params) => api.get('/stats/season', { params }),
  getHeroStatsData: (params) => api.get('/stats/hero', { params }),
  getHeroBanStatsData: (params) => api.get('/stats/hero/ban', { params }),
  getMapPickStatsData: (params) => api.get('/stats/map/pick', { params }),
  comparePlayers: (playerIds) => api.get('/stats/player/compare', { params: { playerIds } }),
  compareTeams: (teamIds) => api.get('/stats/team/compare', { params: { teamIds } }),
  
  // SeasonTeam相关
  getAllSeasonTeams: () => api.get('/season-teams'),
  getSeasonTeams: (seasonId) => api.get(`/seasons/${seasonId}/teams`),
  createSeasonTeam: (data) => api.post('/season-teams', data),
  bulkCreateSeasonTeams: (data) => api.post('/season-teams/bulk', data),
  updateSeasonTeam: (id, data) => api.put(`/season-teams/${id}`, data),
  deleteSeasonTeam: (id) => api.delete(`/season-teams/${id}`),
  
  // SeasonTeamPlayer相关
  getSeasonTeamPlayers: (seasonTeamId) => api.get(`/season-teams/${seasonTeamId}/players`),
  createSeasonTeamPlayer: (data) => api.post('/season-team-players', data),
  bulkCreateSeasonTeamPlayers: (data) => api.post('/season-team-players/bulk', data),
  updateSeasonTeamPlayer: (id, data) => api.put(`/season-team-players/${id}`, data),
  deleteSeasonTeamPlayer: (id) => api.delete(`/season-team-players/${id}`),

  // Season Stats (New)
  uploadSeasonStats: (formData) => api.post('/season-stats/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  previewAISeasonStats: (formData) => api.post('/season-stats/ai-preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getSeasonPlayerStats: (seasonId) => api.get(`/season-stats/${seasonId}`),
  getSeasonTeamScoreStats: (seasonId, params) => api.get(`/season-stats/${seasonId}/team-score`, params ? { params } : undefined),
  getSeasonMapPickStats: (seasonId) => api.get(`/season-stats/${seasonId}/map-picks`),
  getSeasonStageSnapshots: (seasonId) => api.get(`/season-stats/${seasonId}/stage-snapshots`),
  createSeasonStageSnapshot: (seasonId, data) => api.post(`/season-stats/${seasonId}/stage-snapshots`, data),
  deleteSeasonStageSnapshot: (snapshotId) => api.delete(`/season-stats/stage-snapshots/${snapshotId}`),

  // Config (New)
  getAllConfigs: () => api.get('/config'),
  getConfig: (key) => api.get(`/config/${key}`),
  updateConfig: (data) => api.post('/config', data)
};

export default apiService;
