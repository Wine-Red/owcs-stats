import { createStore } from 'vuex';
import apiService from '../services/api';

const store = createStore({
  state: {
    // 赛季数据
    seasons: [],
    // 队伍数据
    teams: [],
    // 选手数据
    players: [],
    // 地图数据
    maps: [],
    // 英雄数据
    heroes: [],
    // 比赛数据
    matches: [],
    // 地图局数据
    mapGames: [],
    // 赛季-队伍关联数据
    seasonTeams: [],
    // 赛季-队伍-选手关联数据
    seasonTeamPlayers: [],
    // 当前正在编辑的比赛
    currentMatch: null,
    // 加载状态
    loading: false,
    // 错误信息
    error: null
  },
  mutations: {
    // 设置赛季数据
    setSeasons(state, seasons) {
      state.seasons = seasons;
    },
    // 设置队伍数据
    setTeams(state, teams) {
      state.teams = teams;
    },
    // 设置选手数据
    setPlayers(state, players) {
      state.players = players;
    },
    // 设置地图数据
    setMaps(state, maps) {
      state.maps = maps;
    },
    // 设置英雄数据
    setHeroes(state, heroes) {
      state.heroes = heroes;
    },
    // 设置比赛数据
    setMatches(state, matches) {
      state.matches = matches;
    },
    // 设置地图局数据
    setMapGames(state, mapGames) {
      state.mapGames = mapGames;
    },
    // 设置赛季-队伍关联数据
    setSeasonTeams(state, seasonTeams) {
      state.seasonTeams = seasonTeams;
    },
    // 设置赛季-队伍-选手关联数据
    setSeasonTeamPlayers(state, seasonTeamPlayers) {
      state.seasonTeamPlayers = seasonTeamPlayers;
    },
    // 设置当前比赛
    setCurrentMatch(state, match) {
      state.currentMatch = match;
    },
    // 设置加载状态
    setLoading(state, loading) {
      state.loading = loading;
    },
    // 设置错误信息
    setError(state, error) {
      state.error = error;
    },
    // 添加比赛
    addMatch(state, match) {
      state.matches.unshift(match);
    },
    // 添加赛季-队伍关联
    addSeasonTeam(state, seasonTeam) {
      state.seasonTeams.unshift(seasonTeam);
    },
    // 添加赛季-队伍-选手关联
    addSeasonTeamPlayer(state, seasonTeamPlayer) {
      state.seasonTeamPlayers.unshift(seasonTeamPlayer);
    },
    // 更新比赛
    updateMatch(state, updatedMatch) {
      const index = state.matches.findIndex(match => match.id === updatedMatch.id);
      if (index !== -1) {
        state.matches.splice(index, 1, updatedMatch);
      }
    },
    // 更新赛季-队伍关联
    updateSeasonTeam(state, updatedSeasonTeam) {
      const index = state.seasonTeams.findIndex(st => st.id === updatedSeasonTeam.id);
      if (index !== -1) {
        state.seasonTeams.splice(index, 1, updatedSeasonTeam);
      }
    },
    // 更新赛季-队伍-选手关联
    updateSeasonTeamPlayer(state, updatedSeasonTeamPlayer) {
      const index = state.seasonTeamPlayers.findIndex(stp => stp.id === updatedSeasonTeamPlayer.id);
      if (index !== -1) {
        state.seasonTeamPlayers.splice(index, 1, updatedSeasonTeamPlayer);
      }
    },
    // 删除比赛
    deleteMatch(state, matchId) {
      state.matches = state.matches.filter(match => match.id !== matchId);
    },
    // 删除赛季-队伍关联
    deleteSeasonTeam(state, seasonTeamId) {
      state.seasonTeams = state.seasonTeams.filter(st => st.id !== seasonTeamId);
    },
    // 删除赛季-队伍-选手关联
    deleteSeasonTeamPlayer(state, seasonTeamPlayerId) {
      state.seasonTeamPlayers = state.seasonTeamPlayers.filter(stp => stp.id !== seasonTeamPlayerId);
    }
  },
  actions: {
    // 加载所有基础数据
    async loadBaseData({ commit }) {
      commit('setLoading', true);
      try {
        // 并行加载所有数据
        const [seasons, teams, players, maps, heroes] = await Promise.all([
          apiService.getSeasons(),
          apiService.getTeams(),
          apiService.getPlayers(),
          apiService.getMaps(),
          apiService.getHeroes()
        ]);
        
        commit('setSeasons', seasons);
        commit('setTeams', teams);
        commit('setPlayers', players);
        commit('setMaps', maps);
        commit('setHeroes', heroes);
      } catch (error) {
        commit('setError', error.message);
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 加载比赛数据
    async loadMatches({ commit }, filters) {
      commit('setLoading', true);
      try {
        const matches = await apiService.getMatches(filters);
        commit('setMatches', matches);
      } catch (error) {
        commit('setError', error.message);
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 加载地图局数据
    async loadMapGames({ commit }, filters) {
      commit('setLoading', true);
      try {
        const mapGames = await apiService.getMapGames(filters);
        commit('setMapGames', mapGames);
        return mapGames;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 创建比赛
    async createMatch({ commit }, matchData) {
      commit('setLoading', true);
      try {
        const match = await apiService.createMatch(matchData);
        commit('addMatch', match);
        return match;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 更新比赛
    async updateMatch({ commit }, { id, matchData }) {
      commit('setLoading', true);
      try {
        const updatedMatch = await apiService.updateMatch(id, matchData);
        commit('updateMatch', updatedMatch);
        return updatedMatch;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 删除比赛
    async deleteMatch({ commit }, matchId) {
      commit('setLoading', true);
      try {
        await apiService.deleteMatch(matchId);
        commit('deleteMatch', matchId);
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 获取赛季的队伍
    async getSeasonTeams({ commit, dispatch }, seasonId) {
      commit('setLoading', true);
      try {
        // 首先获取所有赛季-队伍关联
        const allSeasonTeams = await apiService.getAllSeasonTeams();
        // 然后筛选出该赛季的关联
        const filteredSeasonTeams = allSeasonTeams.filter(st => st.seasonId === seasonId);
        // 更新赛季-队伍关联数据
        commit('setSeasonTeams', filteredSeasonTeams);

        // 并行获取该赛季所有队伍的选手关联数据
        await Promise.all(filteredSeasonTeams.map(st => dispatch('getSeasonTeamPlayers', st.id)));

        // 然后获取该赛季的队伍列表
        const teams = await apiService.getSeasonTeams(seasonId);
        return teams;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 创建赛季-队伍关联
    async createSeasonTeam({ commit }, seasonTeamData) {
      commit('setLoading', true);
      try {
        const seasonTeam = await apiService.createSeasonTeam(seasonTeamData);
        commit('addSeasonTeam', seasonTeam);
        return seasonTeam;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    // 批量创建赛季-队伍关联
    async bulkCreateSeasonTeams({ commit }, { seasonId, teamIds }) {
      commit('setLoading', true);
      try {
        const result = await apiService.bulkCreateSeasonTeams({ seasonId, teamIds });
        result.created.forEach(seasonTeam => {
          commit('addSeasonTeam', seasonTeam);
        });
        return result;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 更新赛季-队伍关联
    async updateSeasonTeam({ commit }, { id, seasonTeamData }) {
      commit('setLoading', true);
      try {
        const updatedSeasonTeam = await apiService.updateSeasonTeam(id, seasonTeamData);
        commit('updateSeasonTeam', updatedSeasonTeam);
        return updatedSeasonTeam;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 删除赛季-队伍关联
    async deleteSeasonTeam({ commit }, seasonTeamId) {
      commit('setLoading', true);
      try {
        const result = await apiService.deleteSeasonTeam(seasonTeamId);
        if (!result.retained) commit('deleteSeasonTeam', seasonTeamId);
        return result;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 获取赛季-队伍的选手
    async getSeasonTeamPlayers({ commit, state }, seasonTeamId) {
      commit('setLoading', true);
      try {
        const newSeasonTeamPlayers = await apiService.getSeasonTeamPlayers(seasonTeamId);
        // 保留非当前 seasonTeamId 的数据
        const otherSeasonTeamPlayers = state.seasonTeamPlayers.filter(stp => stp.seasonTeamId !== seasonTeamId);
        // 合并新数据
        const mergedSeasonTeamPlayers = [...otherSeasonTeamPlayers, ...newSeasonTeamPlayers];
        
        commit('setSeasonTeamPlayers', mergedSeasonTeamPlayers);
        return newSeasonTeamPlayers;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 创建赛季-队伍-选手关联
    async createSeasonTeamPlayer({ commit }, seasonTeamPlayerData) {
      commit('setLoading', true);
      try {
        const seasonTeamPlayer = await apiService.createSeasonTeamPlayer(seasonTeamPlayerData);
        commit('addSeasonTeamPlayer', seasonTeamPlayer);
        return seasonTeamPlayer;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    // 批量创建赛季-队伍-选手关联
    async bulkCreateSeasonTeamPlayers({ commit }, { seasonTeamId, playerIds }) {
      commit('setLoading', true);
      try {
        const result = await apiService.bulkCreateSeasonTeamPlayers({ seasonTeamId, playerIds });
        result.created.forEach(seasonTeamPlayer => {
          commit('addSeasonTeamPlayer', seasonTeamPlayer);
        });
        return result;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 更新赛季-队伍-选手关联
    async updateSeasonTeamPlayer({ commit }, { id, seasonTeamPlayerData }) {
      commit('setLoading', true);
      try {
        const updatedSeasonTeamPlayer = await apiService.updateSeasonTeamPlayer(id, seasonTeamPlayerData);
        commit('updateSeasonTeamPlayer', updatedSeasonTeamPlayer);
        return updatedSeasonTeamPlayer;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 删除赛季-队伍-选手关联
    async deleteSeasonTeamPlayer({ commit }, seasonTeamPlayerId) {
      commit('setLoading', true);
      try {
        const result = await apiService.deleteSeasonTeamPlayer(seasonTeamPlayerId);
        if (!result.retained) commit('deleteSeasonTeamPlayer', seasonTeamPlayerId);
        return result;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 赛季CRUD操作
    async createSeason({ commit }, seasonData) {
      commit('setLoading', true);
      try {
        const season = await apiService.createSeason(seasonData);
        // 重新加载所有赛季数据
        const seasons = await apiService.getSeasons();
        commit('setSeasons', seasons);
        return season;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    async updateSeason({ commit }, { id, seasonData }) {
      commit('setLoading', true);
      try {
        const updatedSeason = await apiService.updateSeason(id, seasonData);
        // 重新加载所有赛季数据
        const seasons = await apiService.getSeasons();
        commit('setSeasons', seasons);
        return updatedSeason;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    async deleteSeason({ commit }, seasonId) {
      commit('setLoading', true);
      try {
        await apiService.deleteSeason(seasonId);
        // 重新加载所有赛季数据
        const seasons = await apiService.getSeasons();
        commit('setSeasons', seasons);
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 队伍CRUD操作
    async createTeam({ commit }, teamData) {
      commit('setLoading', true);
      try {
        const team = await apiService.createTeam(teamData);
        // 重新加载所有队伍数据
        const teams = await apiService.getTeams();
        commit('setTeams', teams);
        return team;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    async updateTeam({ commit }, { id, teamData }) {
      commit('setLoading', true);
      try {
        const updatedTeam = await apiService.updateTeam(id, teamData);
        // 重新加载所有队伍数据
        const teams = await apiService.getTeams();
        commit('setTeams', teams);
        return updatedTeam;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    async deleteTeam({ commit }, teamId) {
      commit('setLoading', true);
      try {
        await apiService.deleteTeam(teamId);
        // 重新加载所有队伍数据
        const teams = await apiService.getTeams();
        commit('setTeams', teams);
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    // 地图 CRUD 操作
    async createMap({ commit }, mapData) {
      commit('setLoading', true);
      try {
        const map = await apiService.createMap(mapData);
        commit('setMaps', await apiService.getMaps());
        return map;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    async updateMap({ commit }, { id, mapData }) {
      commit('setLoading', true);
      try {
        const map = await apiService.updateMap(id, mapData);
        commit('setMaps', await apiService.getMaps());
        return map;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    async deleteMap({ commit }, id) {
      commit('setLoading', true);
      try {
        await apiService.deleteMap(id);
        commit('setMaps', await apiService.getMaps());
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    // 英雄 CRUD 操作
    async createHero({ commit }, heroData) {
      commit('setLoading', true);
      try {
        const hero = await apiService.createHero(heroData);
        commit('setHeroes', await apiService.getHeroes());
        return hero;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    async updateHero({ commit }, { id, heroData }) {
      commit('setLoading', true);
      try {
        const hero = await apiService.updateHero(id, heroData);
        commit('setHeroes', await apiService.getHeroes());
        return hero;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    async deleteHero({ commit }, id) {
      commit('setLoading', true);
      try {
        await apiService.deleteHero(id);
        commit('setHeroes', await apiService.getHeroes());
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },
    
    // 选手CRUD操作
    async createPlayer({ commit }, playerData) {
      commit('setLoading', true);
      try {
        const player = await apiService.createPlayer(playerData);
        // 重新加载所有选手数据
        const players = await apiService.getPlayers();
        commit('setPlayers', players);
        return player;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    async updatePlayer({ commit }, { id, playerData }) {
      commit('setLoading', true);
      try {
        const updatedPlayer = await apiService.updatePlayer(id, playerData);
        // 重新加载所有选手数据
        const players = await apiService.getPlayers();
        commit('setPlayers', players);
        return updatedPlayer;
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    },

    async deletePlayer({ commit }, playerId) {
      commit('setLoading', true);
      try {
        await apiService.deletePlayer(playerId);
        // 重新加载所有选手数据
        const players = await apiService.getPlayers();
        commit('setPlayers', players);
      } catch (error) {
        commit('setError', error.message);
        throw error;
      } finally {
        commit('setLoading', false);
      }
    }
  },
  getters: {
    // 获取所有赛季
    allSeasons: state => state.seasons,
    // 获取所有队伍
    allTeams: state => state.teams,
    // 获取所有选手
    allPlayers: state => state.players,
    // 获取所有地图
    allMaps: state => state.maps,
    // 获取所有英雄
    allHeroes: state => state.heroes,
    // 获取所有比赛
    allMatches: state => state.matches,
    // 获取所有地图局
    allMapGames: state => state.mapGames,
    // 获取所有赛季-队伍关联
    allSeasonTeams: state => state.seasonTeams,
    // 获取所有赛季-队伍-选手关联
    allSeasonTeamPlayers: state => state.seasonTeamPlayers,
    // 获取当前比赛
    currentMatch: state => state.currentMatch,
    // 获取加载状态
    isLoading: state => state.loading,
    // 获取错误信息
    error: state => state.error,
    // 根据赛季ID获取参赛队伍
    getTeamsBySeasonId: state => seasonId => {
      // 首先过滤出该赛季的所有赛季-队伍关联
      const seasonTeams = state.seasonTeams.filter(st => st.seasonId === seasonId);
      // 然后获取这些关联对应的队伍
      const teams = [];
      seasonTeams.forEach(st => {
        const team = state.teams.find(t => t.id === st.teamId);
        if (team) {
          teams.push(team);
        }
      });
      return teams;
    },
    // 根据赛季-队伍ID获取选手
    getPlayersBySeasonTeamId: state => seasonTeamId => {
      const playerIds = state.seasonTeamPlayers
        .filter(stp => stp.seasonTeamId === seasonTeamId)
        .map(stp => stp.playerId);
      return state.players.filter(player => playerIds.includes(player.id));
    },
    // 根据赛季ID和队伍ID获取赛季-队伍关联
    getSeasonTeamBySeasonAndTeam: state => (seasonId, teamId) => {
      return state.seasonTeams.find(st => st.seasonId === seasonId && st.teamId === teamId);
    },
    // 根据ID获取赛季
    getSeasonById: state => id => {
      return state.seasons.find(season => season.id === id);
    },
    // 根据ID获取队伍
    getTeamById: state => id => {
      return state.teams.find(team => team.id === id);
    },
    // 根据ID获取选手
    getPlayerById: state => id => {
      return state.players.find(player => player.id === id);
    },
    // 根据ID获取地图
    getMapById: state => id => {
      return state.maps.find(map => map.id === id);
    },
    // 根据ID获取英雄
    getHeroById: state => id => {
      return state.heroes.find(hero => hero.id === id);
    }
  }
});

export default store;
