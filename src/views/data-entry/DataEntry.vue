<template>
  <div class="data-entry-container">
    <h2 class="page-title">地图局数据录入</h2>

    <el-steps :active="currentStep" finish-status="success" align-center class="steps-container">
      <el-step title="创建地图局" description="选择赛季、地图、队伍等信息" />
      <el-step title="选择上场阵容" description="选择选手并填写数据" />
    </el-steps>

    <div class="step-content">
      <el-form :model="formData" :rules="rules" ref="formRef" label-width="120px">
        <template v-if="currentStep === 0">
          <el-card class="form-card">
            <template #header>
              <div class="card-header">
                <span>地图局基本信息</span>
              </div>
            </template>
            <el-form-item label="赛季" prop="seasonId">
              <el-select v-model="formData.seasonId" placeholder="请选择赛季" style="width: 100%" @change="handleSeasonChange">
                <el-option
                  v-for="season in seasons"
                  :key="season.id"
                  :label="season.name"
                  :value="season.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="地图" prop="mapId">
              <el-select v-model="formData.mapId" placeholder="请选择地图" style="width: 100%">
                <el-option
                  v-for="map in maps"
                  :key="map.id"
                  :label="map.name"
                  :value="map.id"
                >
                  <span>{{ map.name }}</span>
                  <span style="color: #8492a6; font-size: 12px; margin-left: 10px">({{ map.type }})</span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="队伍1" prop="team1Id">
              <el-select v-model="formData.team1Id" placeholder="请选择队伍1" style="width: 100%" @change="handleTeam1Change">
                <el-option
                  v-for="team in seasonTeams"
                  :key="team.id"
                  :label="team.name"
                  :value="team.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="队伍2" prop="team2Id">
              <el-select v-model="formData.team2Id" placeholder="请选择队伍2" style="width: 100%" @change="handleTeam2Change">
                <el-option
                  v-for="team in seasonTeams"
                  :key="team.id"
                  :label="team.name"
                  :value="team.id"
                  :disabled="team.id === formData.team1Id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="获胜队伍" prop="winnerId">
              <el-select v-model="formData.winnerId" placeholder="请选择获胜队伍" style="width: 100%">
                <el-option
                  v-if="formData.team1Id"
                  :label="getTeamName(formData.team1Id)"
                  :value="formData.team1Id"
                />
                <el-option
                  v-if="formData.team2Id"
                  :label="getTeamName(formData.team2Id)"
                  :value="formData.team2Id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="队伍1 Ban" prop="team1BanHeroId">
              <el-select v-model="formData.team1BanHeroId" placeholder="请选择Ban英雄" style="width: 100%" clearable>
                <el-option
                  v-for="hero in heroes"
                  :key="hero.id"
                  :label="hero.name"
                  :value="hero.id"
                >
                  <span>{{ hero.name }}</span>
                  <span style="color: #8492a6; font-size: 12px; margin-left: 10px">({{ getRoleText(hero.role) }})</span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="队伍2 Ban" prop="team2BanHeroId">
              <el-select v-model="formData.team2BanHeroId" placeholder="请选择Ban英雄" style="width: 100%" clearable>
                <el-option
                  v-for="hero in heroes"
                  :key="hero.id"
                  :label="hero.name"
                  :value="hero.id"
                >
                  <span>{{ hero.name }}</span>
                  <span style="color: #8492a6; font-size: 12px; margin-left: 10px">({{ getRoleText(hero.role) }})</span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="时长(分钟)" prop="duration">
              <el-input-number
                v-model="formData.duration"
                :min="1"
                :max="120"
                :step="1"
                style="width: 100%"
              />
            </el-form-item>
          </el-card>
        </template>

        <template v-if="currentStep === 1">
          <el-card class="form-card" v-if="formData.team1Id">
            <template #header>
              <div class="card-header">
                <span>{{ getTeamName(formData.team1Id) }} 上场阵容</span>
              </div>
            </template>
            <div class="lineup-section">
              <div class="role-section" v-for="role in ['tank', 'damage', 'support']" :key="'team1-' + role" :data-role="role">
                <h4>{{ getRoleText(role) }} ({{ getRoleCount(role) }}人)</h4>
                <div class="player-slots">
                  <div class="player-slot" v-for="(slot, index) in getRoleSlots(role)" :key="'team1-' + role + '-' + index">
                    <el-form-item :label="'选手' + (index + 1)" :prop="`lineup.team1.${role}${index + 1}`">
                      <el-select
                        v-model="formData.lineup.team1[role + (index + 1)]"
                        :placeholder="'选择' + getRoleText(role) + '选手'"
                        style="width: 100%"
                        @change="handlePlayerChange('team1', role, index + 1)"
                      >
                        <el-option
                          v-for="player in getTeamPlayersByRole('team1', role)"
                          :key="player.id"
                          :label="player.name"
                          :value="player.id"
                          :disabled="isPlayerSelected('team1', player.id)"
                        />
                      </el-select>
                    </el-form-item>
                    <div v-if="formData.lineup.team1[role + (index + 1)]" class="player-stats-form">
                      <el-form-item :label="'英雄'" :prop="`playerStats.team1.${role}${index + 1}.heroId`">
                        <el-select
                          v-model="getPlayerStat('team1', role, index + 1).heroId"
                          :placeholder="'选择' + getRoleText(role) + '英雄'"
                          style="width: 100%"
                        >
                          <el-option
                            v-for="hero in getHeroesByRole(role)"
                            :key="hero.id"
                            :label="hero.name"
                            :value="hero.id"
                          />
                        </el-select>
                      </el-form-item>
                      <div class="stats-grid">
                        <el-form-item :prop="`playerStats.team1.${role}${index + 1}.kills`">
                          <el-input-number v-model="getPlayerStat('team1', role, index + 1).kills" :min="0" :controls="false" placeholder="击杀" />
                          <span class="stat-label">击杀</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team1.${role}${index + 1}.deaths`">
                          <el-input-number v-model="getPlayerStat('team1', role, index + 1).deaths" :min="0" :controls="false" placeholder="死亡" />
                          <span class="stat-label">死亡</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team1.${role}${index + 1}.assists`">
                          <el-input-number v-model="getPlayerStat('team1', role, index + 1).assists" :min="0" :controls="false" placeholder="助攻" />
                          <span class="stat-label">助攻</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team1.${role}${index + 1}.damage`">
                          <el-input-number v-model="getPlayerStat('team1', role, index + 1).damage" :min="0" :controls="false" placeholder="伤害" />
                          <span class="stat-label">伤害</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team1.${role}${index + 1}.healing`">
                          <el-input-number v-model="getPlayerStat('team1', role, index + 1).healing" :min="0" :controls="false" placeholder="治疗" />
                          <span class="stat-label">治疗</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team1.${role}${index + 1}.mitigation`">
                          <el-input-number v-model="getPlayerStat('team1', role, index + 1).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                          <span class="stat-label">抵挡</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team1.${role}${index + 1}.ultsUsed`">
                          <el-input-number v-model="getPlayerStat('team1', role, index + 1).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                          <span class="stat-label">大招</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team1.${role}${index + 1}.finalBlows`">
                          <el-input-number v-model="getPlayerStat('team1', role, index + 1).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                          <span class="stat-label">最后一击</span>
                        </el-form-item>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </el-card>

          <el-card class="form-card" v-if="formData.team2Id" style="margin-top: 20px">
            <template #header>
              <div class="card-header">
                <span>{{ getTeamName(formData.team2Id) }} 上场阵容</span>
              </div>
            </template>
            <div class="lineup-section">
              <div class="role-section" v-for="role in ['tank', 'damage', 'support']" :key="'team2-' + role" :data-role="role">
                <h4>{{ getRoleText(role) }} ({{ getRoleCount(role) }}人)</h4>
                <div class="player-slots">
                  <div class="player-slot" v-for="(slot, index) in getRoleSlots(role)" :key="'team2-' + role + '-' + index">
                    <el-form-item :label="'选手' + (index + 1)" :prop="`lineup.team2.${role}${index + 1}`">
                      <el-select
                        v-model="formData.lineup.team2[role + (index + 1)]"
                        :placeholder="'选择' + getRoleText(role) + '选手'"
                        style="width: 100%"
                        @change="handlePlayerChange('team2', role, index + 1)"
                      >
                        <el-option
                          v-for="player in getTeamPlayersByRole('team2', role)"
                          :key="player.id"
                          :label="player.name"
                          :value="player.id"
                          :disabled="isPlayerSelected('team2', player.id)"
                        />
                      </el-select>
                    </el-form-item>
                    <div v-if="formData.lineup.team2[role + (index + 1)]" class="player-stats-form">
                      <el-form-item :label="'英雄'" :prop="`playerStats.team2.${role}${index + 1}.heroId`">
                        <el-select
                          v-model="getPlayerStat('team2', role, index + 1).heroId"
                          :placeholder="'选择' + getRoleText(role) + '英雄'"
                          style="width: 100%"
                        >
                          <el-option
                            v-for="hero in getHeroesByRole(role)"
                            :key="hero.id"
                            :label="hero.name"
                            :value="hero.id"
                          />
                        </el-select>
                      </el-form-item>
                      <div class="stats-grid">
                        <el-form-item :prop="`playerStats.team2.${role}${index + 1}.kills`">
                          <el-input-number v-model="getPlayerStat('team2', role, index + 1).kills" :min="0" :controls="false" placeholder="击杀" />
                          <span class="stat-label">击杀</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team2.${role}${index + 1}.deaths`">
                          <el-input-number v-model="getPlayerStat('team2', role, index + 1).deaths" :min="0" :controls="false" placeholder="死亡" />
                          <span class="stat-label">死亡</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team2.${role}${index + 1}.assists`">
                          <el-input-number v-model="getPlayerStat('team2', role, index + 1).assists" :min="0" :controls="false" placeholder="助攻" />
                          <span class="stat-label">助攻</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team2.${role}${index + 1}.damage`">
                          <el-input-number v-model="getPlayerStat('team2', role, index + 1).damage" :min="0" :controls="false" placeholder="伤害" />
                          <span class="stat-label">伤害</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team2.${role}${index + 1}.healing`">
                          <el-input-number v-model="getPlayerStat('team2', role, index + 1).healing" :min="0" :controls="false" placeholder="治疗" />
                          <span class="stat-label">治疗</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team2.${role}${index + 1}.mitigation`">
                          <el-input-number v-model="getPlayerStat('team2', role, index + 1).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                          <span class="stat-label">抵挡</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team2.${role}${index + 1}.ultsUsed`">
                          <el-input-number v-model="getPlayerStat('team2', role, index + 1).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                          <span class="stat-label">大招</span>
                        </el-form-item>
                        <el-form-item :prop="`playerStats.team2.${role}${index + 1}.finalBlows`">
                          <el-input-number v-model="getPlayerStat('team2', role, index + 1).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                          <span class="stat-label">最后一击</span>
                        </el-form-item>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </el-card>
        </template>
      </el-form>
    </div>

    <div class="step-actions">
      <el-button v-if="currentStep > 0" @click="prevStep">上一步</el-button>
      <el-button v-if="currentStep < 1" type="primary" @click="nextStep">下一步</el-button>
      <el-button v-if="currentStep === 1" type="primary" @click="submitForm" :loading="submitting">提交</el-button>
      <el-button @click="resetForm">重置</el-button>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';

export default {
  name: 'DataEntry',
  setup() {
    const store = useStore();
    const formRef = ref(null);
    const currentStep = ref(0);
    const submitting = ref(false);

    const formData = ref({
      seasonId: '',
      mapId: '',
      team1Id: '',
      team2Id: '',
      winnerId: '',
      team1BanHeroId: '',
      team2BanHeroId: '',
      duration: 10,
      lineup: {
        team1: {
          tank1: '',
          damage1: '',
          damage2: '',
          support1: '',
          support2: ''
        },
        team2: {
          tank1: '',
          damage1: '',
          damage2: '',
          support1: '',
          support2: ''
        }
      },
      playerStats: {
        team1: {
          tank1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          damage1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          damage2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          support1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          support2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 }
        },
        team2: {
          tank1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          damage1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          damage2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          support1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          support2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 }
        }
      }
    });

    const rules = {
      seasonId: [{ required: true, message: '请选择赛季', trigger: 'change' }],
      mapId: [{ required: true, message: '请选择地图', trigger: 'change' }],
      team1Id: [{ required: true, message: '请选择队伍1', trigger: 'change' }],
      team2Id: [{ required: true, message: '请选择队伍2', trigger: 'change' }],
      winnerId: [{ required: true, message: '请选择获胜队伍', trigger: 'change' }],
      duration: [{ required: true, message: '请输入时长', trigger: 'blur' }]
    };

    const seasons = computed(() => store.state.seasons);
    const maps = computed(() => store.state.maps);
    const heroes = computed(() => store.state.heroes);

    const seasonTeams = computed(() => {
      if (!formData.value.seasonId) return [];
      return store.getters.getTeamsBySeasonId(formData.value.seasonId);
    });

    const team1Players = computed(() => {
      if (!formData.value.seasonId || !formData.value.team1Id) return [];
      const seasonTeam = store.getters.getSeasonTeamBySeasonAndTeam(formData.value.seasonId, formData.value.team1Id);
      if (!seasonTeam) return [];
      return store.getters.getPlayersBySeasonTeamId(seasonTeam.id);
    });

    const team2Players = computed(() => {
      if (!formData.value.seasonId || !formData.value.team2Id) return [];
      const seasonTeam = store.getters.getSeasonTeamBySeasonAndTeam(formData.value.seasonId, formData.value.team2Id);
      if (!seasonTeam) return [];
      return store.getters.getPlayersBySeasonTeamId(seasonTeam.id);
    });

    const getTeamName = (teamId) => {
      const team = store.getters.getTeamById(teamId);
      return team ? team.name : '';
    };

    const getRoleText = (role) => {
      const roleMap = {
        tank: '坦克',
        damage: '输出',
        support: '辅助'
      };
      return roleMap[role] || role;
    };

    const getRoleCount = (role) => {
      const countMap = {
        tank: 1,
        damage: 2,
        support: 2
      };
      return countMap[role] || 0;
    };

    const getRoleSlots = (role) => {
      const count = getRoleCount(role);
      return Array.from({ length: count }, (_, i) => i + 1);
    };

    const getTeamPlayersByRole = (teamKey, role) => {
      const players = teamKey === 'team1' ? team1Players.value : team2Players.value;
      return players.filter(p => p.role === role);
    };

    const getHeroesByRole = (role) => {
      return heroes.value.filter(hero => hero.role === role);
    };

    const isPlayerSelected = (teamKey, playerId) => {
      const lineup = formData.value.lineup[teamKey];
      return Object.values(lineup).includes(playerId);
    };

    const getPlayerStat = (teamKey, role, index) => {
      return formData.value.playerStats[teamKey][role + index];
    };

    const handleSeasonChange = async () => {
      formData.value.team1Id = '';
      formData.value.team2Id = '';
      formData.value.winnerId = '';
      resetLineup();
      if (formData.value.seasonId) {
        try {
          await store.dispatch('loadBaseData');
          await store.dispatch('getSeasonTeams', formData.value.seasonId);
        } catch (error) {
          ElMessage.error('加载赛季队伍失败: ' + error.message);
        }
      }
    };

    const handleTeam1Change = async () => {
      if (formData.value.team1Id === formData.value.team2Id) {
        formData.value.team2Id = '';
      }
      formData.value.winnerId = '';
      resetLineup();
      if (formData.value.seasonId && formData.value.team1Id) {
        const seasonTeam1 = store.getters.getSeasonTeamBySeasonAndTeam(formData.value.seasonId, formData.value.team1Id);
        if (seasonTeam1) {
          try {
            await store.dispatch('getSeasonTeamPlayers', seasonTeam1.id);
          } catch (error) {
            ElMessage.error('加载队伍1选手失败: ' + error.message);
          }
        }
      }
    };

    const handleTeam2Change = async () => {
      if (formData.value.team1Id === formData.value.team2Id) {
        formData.value.team1Id = '';
      }
      formData.value.winnerId = '';
      resetLineup();
      if (formData.value.seasonId && formData.value.team2Id) {
        const seasonTeam2 = store.getters.getSeasonTeamBySeasonAndTeam(formData.value.seasonId, formData.value.team2Id);
        if (seasonTeam2) {
          try {
            await store.dispatch('getSeasonTeamPlayers', seasonTeam2.id);
          } catch (error) {
            ElMessage.error('加载队伍2选手失败: ' + error.message);
          }
        }
      }
    };

    const handlePlayerChange = (teamKey, role, index) => {
      const playerId = formData.value.lineup[teamKey][role + index];
      if (playerId) {
        const stat = formData.value.playerStats[teamKey][role + index];
        stat.heroId = '';
        stat.kills = 0;
        stat.deaths = 0;
        stat.assists = 0;
        stat.damage = 0;
        stat.healing = 0;
        stat.mitigation = 0;
        stat.ultsUsed = 0;
        stat.finalBlows = 0;
      }
    };

    const resetLineup = () => {
      formData.value.lineup = {
        team1: {
          tank1: '',
          damage1: '',
          damage2: '',
          support1: '',
          support2: ''
        },
        team2: {
          tank1: '',
          damage1: '',
          damage2: '',
          support1: '',
          support2: ''
        }
      };
      formData.value.playerStats = {
        team1: {
          tank1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          damage1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          damage2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          support1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          support2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 }
        },
        team2: {
          tank1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          damage1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          damage2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          support1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
          support2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 }
        }
      };
    };

    const nextStep = async () => {
      if (!formRef.value) return;
      await formRef.value.validate(async (valid) => {
        if (valid) {
          currentStep.value++;
          fillDefaultLineup();
        } else {
          ElMessage.warning('请检查表单数据');
        }
      });
    };

    const prevStep = () => {
      currentStep.value--;
    };

    const fillDefaultLineup = () => {
      if (formData.value.team1Id) {
        const tankPlayers = team1Players.value.filter(p => p.role === 'tank').sort((a, b) => a.id - b.id);
        if (tankPlayers.length > 0) {
          formData.value.lineup.team1.tank1 = tankPlayers[0].id;
        }
        const dpsPlayers = team1Players.value.filter(p => p.role === 'damage').sort((a, b) => a.id - b.id);
        if (dpsPlayers.length > 0) {
          formData.value.lineup.team1.damage1 = dpsPlayers[0].id;
        }
        if (dpsPlayers.length > 1) {
          formData.value.lineup.team1.damage2 = dpsPlayers[1].id;
        }
        const supportPlayers = team1Players.value.filter(p => p.role === 'support').sort((a, b) => a.id - b.id);
        if (supportPlayers.length > 0) {
          formData.value.lineup.team1.support1 = supportPlayers[0].id;
        }
        if (supportPlayers.length > 1) {
          formData.value.lineup.team1.support2 = supportPlayers[1].id;
        }
      }
      if (formData.value.team2Id) {
        const tankPlayers = team2Players.value.filter(p => p.role === 'tank').sort((a, b) => a.id - b.id);
        if (tankPlayers.length > 0) {
          formData.value.lineup.team2.tank1 = tankPlayers[0].id;
        }
        const dpsPlayers = team2Players.value.filter(p => p.role === 'damage').sort((a, b) => a.id - b.id);
        if (dpsPlayers.length > 0) {
          formData.value.lineup.team2.damage1 = dpsPlayers[0].id;
        }
        if (dpsPlayers.length > 1) {
          formData.value.lineup.team2.damage2 = dpsPlayers[1].id;
        }
        const supportPlayers = team2Players.value.filter(p => p.role === 'support').sort((a, b) => a.id - b.id);
        if (supportPlayers.length > 0) {
          formData.value.lineup.team2.support1 = supportPlayers[0].id;
        }
        if (supportPlayers.length > 1) {
          formData.value.lineup.team2.support2 = supportPlayers[1].id;
        }
      }
    };

    const submitForm = async () => {
      if (!formRef.value) return;
      submitting.value = true;
      try {
        const mapGameData = {
          seasonId: formData.value.seasonId,
          mapId: formData.value.mapId,
          team1Id: formData.value.team1Id,
          team2Id: formData.value.team2Id,
          winnerId: formData.value.winnerId,
          team1BanHeroId: formData.value.team1BanHeroId,
          team2BanHeroId: formData.value.team2BanHeroId,
          duration: formData.value.duration,
          playerStats: []
        };

        const teamKeys = ['team1', 'team2'];
        const roleKeys = ['tank', 'damage', 'support'];
        const roleCounts = { tank: 1, damage: 2, support: 2 };

        teamKeys.forEach(teamKey => {
          const teamId = teamKey === 'team1' ? formData.value.team1Id : formData.value.team2Id;
          roleKeys.forEach(role => {
            for (let i = 1; i <= roleCounts[role]; i++) {
              const playerId = formData.value.lineup[teamKey][role + i];
              const stat = formData.value.playerStats[teamKey][role + i];
              if (playerId && stat.heroId) {
                mapGameData.playerStats.push({
                  playerId: playerId,
                  teamId: teamId,
                  heroId: stat.heroId,
                  kills: stat.kills,
                  deaths: stat.deaths,
                  assists: stat.assists,
                  damage: stat.damage,
                  healing: stat.healing,
                  mitigation: stat.mitigation,
                  ultsUsed: stat.ultsUsed,
                  finalBlows: stat.finalBlows
                });
              }
            }
          });
        });

        if (mapGameData.playerStats.length === 0) {
          ElMessage.warning('请至少填写一个选手的数据');
          return;
        }

        await store.dispatch('createMapGame', mapGameData);
        ElMessage.success('地图局数据提交成功');
        resetForm();
      } catch (error) {
        ElMessage.error('数据提交失败: ' + error.message);
      } finally {
        submitting.value = false;
      }
    };

    const resetForm = () => {
      formData.value = {
        seasonId: '',
        mapId: '',
        team1Id: '',
        team2Id: '',
        winnerId: '',
        team1BanHeroId: '',
        team2BanHeroId: '',
        duration: 10,
        lineup: {
          team1: {
            tank1: '',
            damage1: '',
            damage2: '',
            support1: '',
            support2: ''
          },
          team2: {
            tank1: '',
            damage1: '',
            damage2: '',
            support1: '',
            support2: ''
          }
        },
        playerStats: {
          team1: {
            tank1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
            damage1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
            damage2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
            support1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
            support2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 }
          },
          team2: {
            tank1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
            damage1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
            damage2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
            support1: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 },
            support2: { heroId: '', kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, mitigation: 0, ultsUsed: 0, finalBlows: 0 }
          }
        }
      };
      currentStep.value = 0;
      if (formRef.value) {
        formRef.value.resetFields();
      }
    };

    onMounted(async () => {
      await store.dispatch('loadBaseData');
    });

    return {
      formData,
      rules,
      formRef,
      currentStep,
      submitting,
      seasons,
      maps,
      heroes,
      seasonTeams,
      team1Players,
      team2Players,
      getTeamName,
      getRoleText,
      getRoleCount,
      getRoleSlots,
      getTeamPlayersByRole,
      getHeroesByRole,
      isPlayerSelected,
      getPlayerStat,
      handleSeasonChange,
      handleTeam1Change,
      handleTeam2Change,
      handlePlayerChange,
      nextStep,
      prevStep,
      submitForm,
      resetForm
    };
  }
};
</script>

<style scoped>
.data-entry-container {
  padding: 20px 0;
}

.page-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 30px;
  color: #303133;
}

.steps-container {
  margin-bottom: 30px;
}

.step-content {
  margin-bottom: 30px;
}

.form-card {
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.lineup-section {
  padding: 10px 0;
}

.role-section {
  margin-bottom: 30px;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 6px;
}

.role-section h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  font-weight: bold;
  color: #409eff;
}

.player-slots {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.player-slot {
  flex: 0 0 auto;
  width: 100%;
  padding: 15px;
  background-color: #fff;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  box-sizing: border-box;
}

.role-section[data-role="tank"] .player-slot {
  width: 100%;
}

.role-section[data-role="damage"] .player-slot,
.role-section[data-role="support"] .player-slot {
  width: calc(50% - 10px);
}

.player-stats-form {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #ebeef5;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.role-section[data-role="damage"] .player-slot .stats-grid,
.role-section[data-role="support"] .player-slot .stats-grid {
  grid-template-columns: repeat(2, 1fr);
}

.stats-grid .el-form-item {
  margin-bottom: 5px;
}

.stats-grid .el-input-number {
  width: 100%;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #909399;
  text-align: center;
  margin-top: 2px;
}

.step-actions {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-top: 30px;
}
</style>
