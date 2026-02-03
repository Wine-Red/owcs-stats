<template>
  <div class="data-entry-container">
    <h2 class="page-title">比赛数据录入</h2>

    <el-form :model="formData" :rules="rules" ref="formRef" label-width="120px">
      <!-- 比赛基本信息 -->
      <el-card class="form-card">
        <template #header>
          <div class="card-header">
            <span>比赛基本信息</span>
          </div>
        </template>
        <el-form-item label="赛季" prop="seasonId">
          <el-select v-model="formData.seasonId" placeholder="请选择赛季" style="width: 100%">
            <el-option
              v-for="season in seasons"
              :key="season.id"
              :label="season.name"
              :value="season.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="比赛日期" prop="matchDate">
          <el-date-picker
            v-model="formData.matchDate"
            type="date"
            placeholder="选择日期"
            style="width: 100%"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>

        <div class="teams-section">
          <el-form-item label="队伍1" prop="team1Id">
            <el-select v-model="formData.team1Id" placeholder="请选择队伍" style="width: 100%" @change="handleTeamChange('team1')">
              <el-option
                v-for="team in seasonTeams"
                :key="team.id"
                :label="team.name"
                :value="team.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="队伍2" prop="team2Id">
            <el-select v-model="formData.team2Id" placeholder="请选择队伍" style="width: 100%" @change="handleTeamChange('team2')">
              <el-option
                v-for="team in seasonTeams"
                :key="team.id"
                :label="team.name"
                :value="team.id"
              />
            </el-select>
          </el-form-item>
        </div>
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
      </el-card>

      <!-- 地图局信息 -->
      <el-card class="form-card" style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>地图局信息</span>
            <el-button type="primary" size="small" @click="addMapGame">
              <el-icon><Plus /></el-icon>
              添加地图局
            </el-button>
          </div>
        </template>
        <div v-if="formData.mapGames.length === 0" class="empty-state">
          <p>请添加至少一个地图局</p>
        </div>
        <div v-for="(mapGame, index) in formData.mapGames" :key="index" class="map-game-item">
          <div class="map-game-header">
            <h4>地图局 {{ index + 1 }}</h4>
            <el-button type="danger" size="small" @click="removeMapGame(index)" :disabled="formData.mapGames.length <= 1">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </div>
          <el-form-item :label="'地图'" :prop="`mapGames.${index}.mapId`" :rules="[{ required: true, message: '请选择地图', trigger: 'change' }]">
            <el-select v-model="mapGame.mapId" placeholder="请选择地图" style="width: 100%">
              <el-option
                v-for="map in maps"
                :key="map.id"
                :label="map.name"
                :value="map.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item :label="'地图局时长'" :prop="`mapGames.${index}.duration`" :rules="[{ required: true, message: '请输入地图局时长', trigger: 'change' }, { min: 1, message: '时长必须大于0', trigger: 'blur' }]">
            <el-input-number
              v-model="mapGame.duration"
              :min="1"
              :max="120"
              label="分钟"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="'获胜队伍'" :prop="`mapGames.${index}.winnerId`" :rules="[{ required: true, message: '请选择获胜队伍', trigger: 'change' }]">
            <el-select v-model="mapGame.winnerId" placeholder="请选择获胜队伍" style="width: 100%">
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
          <div class="ban-heroes-section">
            <el-form-item :label="'队伍1Ban英雄'" :prop="`mapGames.${index}.team1BanHeroId`">
              <el-select v-model="mapGame.team1BanHeroId" placeholder="请选择Ban英雄" style="width: 100%">
                <el-option
                  v-for="hero in heroes"
                  :key="hero.id"
                  :label="hero.name"
                  :value="hero.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="'队伍2Ban英雄'" :prop="`mapGames.${index}.team2BanHeroId`">
              <el-select v-model="mapGame.team2BanHeroId" placeholder="请选择Ban英雄" style="width: 100%">
                <el-option
                  v-for="hero in heroes"
                  :key="hero.id"
                  :label="hero.name"
                  :value="hero.id"
                />
              </el-select>
            </el-form-item>
          </div>

          <!-- 选手数据 -->
          <div class="players-section">
            <h5>选手数据</h5>
            <!-- 队伍1选手 -->
            <div v-if="formData.team1Id" class="team-players">
              <h6>{{ getTeamName(formData.team1Id) }}</h6>
              
              <!-- 坦克选手 -->
              <div class="role-section">
                <h7>坦克 (1人)</h7>
                <div v-if="mapGame.lineup.team1.tank" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team1.tank`">
                    <el-select v-model="mapGame.lineup.team1.tank" placeholder="选择坦克选手" style="width: 100%" @change="handlePlayerChange(index, 'team1', 'tank')">
                      <el-option
                        v-for="player in team1Players.filter(p => p.role === 'tank')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team1.tank) }}</span>
                    <span class="player-role">坦克</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.heroId`">
                  <el-select v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).heroId" placeholder="选择英雄" style="width: 100%">
                    <el-option
                      v-for="hero in getFilteredHeroes('tank')"
                      :key="hero.id"
                      :label="hero.name"
                      :value="hero.id"
                    />
                  </el-select>
                </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.tank, formData.team1Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.tank, formData.team1Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
              </div>
              
              <!-- 输出选手 -->
              <div class="role-section">
                <h7>输出 (2人)</h7>
                <div v-if="mapGame.lineup.team1.dps1" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team1.dps1`">
                    <el-select v-model="mapGame.lineup.team1.dps1" placeholder="选择输出选手1" style="width: 100%" @change="handlePlayerChange(index, 'team1', 'dps1')">
                      <el-option
                        v-for="player in team1Players.filter(p => p.role === 'damage')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team1.dps1) }}</span>
                    <span class="player-role">输出</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.heroId`">
                  <el-select v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).heroId" placeholder="选择英雄" style="width: 100%">
                    <el-option
                      v-for="hero in getFilteredHeroes('damage')"
                      :key="hero.id"
                      :label="hero.name"
                      :value="hero.id"
                    />
                  </el-select>
                </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps1, formData.team1Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps1, formData.team1Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
                <div v-if="mapGame.lineup.team1.dps2" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team1.dps2`">
                    <el-select v-model="mapGame.lineup.team1.dps2" placeholder="选择输出选手2" style="width: 100%" @change="handlePlayerChange(index, 'team1', 'dps2')">
                      <el-option
                        v-for="player in team1Players.filter(p => p.role === 'damage')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team1.dps2) }}</span>
                    <span class="player-role">输出</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.heroId`">
                  <el-select v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).heroId" placeholder="选择英雄" style="width: 100%">
                    <el-option
                      v-for="hero in getFilteredHeroes('damage')"
                      :key="hero.id"
                      :label="hero.name"
                      :value="hero.id"
                    />
                  </el-select>
                </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.dps2, formData.team1Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.dps2, formData.team1Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
              </div>
              
              <!-- 辅助选手 -->
              <div class="role-section">
                <h7>辅助 (2人)</h7>
                <div v-if="mapGame.lineup.team1.support1" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team1.support1`">
                    <el-select v-model="mapGame.lineup.team1.support1" placeholder="选择辅助选手1" style="width: 100%" @change="handlePlayerChange(index, 'team1', 'support1')">
                      <el-option
                        v-for="player in team1Players.filter(p => p.role === 'support')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team1.support1) }}</span>
                    <span class="player-role">辅助</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.heroId`">
                    <el-select v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).heroId" placeholder="选择英雄" style="width: 100%">
                      <el-option
                        v-for="hero in getFilteredHeroes('support')"
                        :key="hero.id"
                        :label="hero.name"
                        :value="hero.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support1, formData.team1Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support1, formData.team1Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
                <div v-if="mapGame.lineup.team1.support2" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team1.support2`">
                    <el-select v-model="mapGame.lineup.team1.support2" placeholder="选择辅助选手2" style="width: 100%" @change="handlePlayerChange(index, 'team1', 'support2')">
                      <el-option
                        v-for="player in team1Players.filter(p => p.role === 'support')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team1.support2) }}</span>
                    <span class="player-role">辅助</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.heroId`">
                    <el-select v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).heroId" placeholder="选择英雄" style="width: 100%">
                      <el-option
                        v-for="hero in getFilteredHeroes('support')"
                        :key="hero.id"
                        :label="hero.name"
                        :value="hero.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team1.support2, formData.team1Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team1.support2, formData.team1Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
              </div>
            </div>

            <!-- 队伍2选手 -->
            <div v-if="formData.team2Id" class="team-players" style="margin-top: 20px">
              <h6>{{ getTeamName(formData.team2Id) }}</h6>
              
              <!-- 坦克选手 -->
              <div class="role-section">
                <h7>坦克 (1人)</h7>
                <div v-if="mapGame.lineup.team2.tank" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team2.tank`">
                    <el-select v-model="mapGame.lineup.team2.tank" placeholder="选择坦克选手" style="width: 100%" @change="handlePlayerChange(index, 'team2', 'tank')">
                      <el-option
                        v-for="player in team2Players.filter(p => p.role === 'tank')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team2.tank) }}</span>
                    <span class="player-role">坦克</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.heroId`">
                    <el-select v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).heroId" placeholder="选择英雄" style="width: 100%">
                      <el-option
                        v-for="hero in getFilteredHeroes('tank')"
                        :key="hero.id"
                        :label="hero.name"
                        :value="hero.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.tank, formData.team2Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.tank, formData.team2Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
              </div>
              
              <!-- 输出选手 -->
              <div class="role-section">
                <h7>输出 (2人)</h7>
                <div v-if="mapGame.lineup.team2.dps1" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team2.dps1`">
                    <el-select v-model="mapGame.lineup.team2.dps1" placeholder="选择输出选手1" style="width: 100%" @change="handlePlayerChange(index, 'team2', 'dps1')">
                      <el-option
                        v-for="player in team2Players.filter(p => p.role === 'damage')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team2.dps1) }}</span>
                    <span class="player-role">输出</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.heroId`">
                    <el-select v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).heroId" placeholder="选择英雄" style="width: 100%">
                      <el-option
                        v-for="hero in getFilteredHeroes('damage')"
                        :key="hero.id"
                        :label="hero.name"
                        :value="hero.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps1, formData.team2Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps1, formData.team2Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
                <div v-if="mapGame.lineup.team2.dps2" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team2.dps2`">
                    <el-select v-model="mapGame.lineup.team2.dps2" placeholder="选择输出选手2" style="width: 100%" @change="handlePlayerChange(index, 'team2', 'dps2')">
                      <el-option
                        v-for="player in team2Players.filter(p => p.role === 'damage')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team2.dps2) }}</span>
                    <span class="player-role">输出</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.heroId`">
                    <el-select v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).heroId" placeholder="选择英雄" style="width: 100%">
                      <el-option
                        v-for="hero in getFilteredHeroes('damage')"
                        :key="hero.id"
                        :label="hero.name"
                        :value="hero.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.dps2, formData.team2Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.dps2, formData.team2Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
              </div>
              
              <!-- 辅助选手 -->
              <div class="role-section">
                <h7>辅助 (2人)</h7>
                <div v-if="mapGame.lineup.team2.support1" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team2.support1`">
                    <el-select v-model="mapGame.lineup.team2.support1" placeholder="选择辅助选手1" style="width: 100%" @change="handlePlayerChange(index, 'team2', 'support1')">
                      <el-option
                        v-for="player in team2Players.filter(p => p.role === 'support')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team2.support1) }}</span>
                    <span class="player-role">辅助</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.heroId`">
                    <el-select v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).heroId" placeholder="选择英雄" style="width: 100%">
                      <el-option
                        v-for="hero in getFilteredHeroes('support')"
                        :key="hero.id"
                        :label="hero.name"
                        :value="hero.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support1, formData.team2Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support1, formData.team2Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
                <div v-if="mapGame.lineup.team2.support2" class="player-stats">
                  <el-form-item label="选择选手" :prop="`mapGames.${index}.lineup.team2.support2`">
                    <el-select v-model="mapGame.lineup.team2.support2" placeholder="选择辅助选手2" style="width: 100%" @change="handlePlayerChange(index, 'team2', 'support2')">
                      <el-option
                        v-for="player in team2Players.filter(p => p.role === 'support')"
                        :key="player.id"
                        :label="player.name"
                        :value="player.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="player-info">
                    <span class="player-name">{{ getPlayerName(mapGame.lineup.team2.support2) }}</span>
                    <span class="player-role">辅助</span>
                  </div>
                  <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.heroId`">
                    <el-select v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).heroId" placeholder="选择英雄" style="width: 100%">
                      <el-option
                        v-for="hero in getFilteredHeroes('support')"
                        :key="hero.id"
                        :label="hero.name"
                        :value="hero.id"
                      />
                    </el-select>
                  </el-form-item>
                  <div class="stats-grid">
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.kills`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).kills" :min="0" :controls="false" placeholder="击杀" />
                      <span class="stat-label">击杀</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.deaths`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).deaths" :min="0" :controls="false" placeholder="死亡" />
                      <span class="stat-label">死亡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.assists`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).assists" :min="0" :controls="false" placeholder="助攻" />
                      <span class="stat-label">助攻</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.damage`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).damage" :min="0" :controls="false" placeholder="伤害" />
                      <span class="stat-label">伤害</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.healing`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).healing" :min="0" :controls="false" placeholder="治疗" />
                      <span class="stat-label">治疗</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.mitigation`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                      <span class="stat-label">抵挡</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.ultsUsed`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                      <span class="stat-label">大招</span>
                    </el-form-item>
                    <el-form-item :prop="`mapGames.${index}.playerStats.${getPlayerStatIndex(index, mapGame.lineup.team2.support2, formData.team2Id)}.finalBlows`">
                      <el-input-number v-model="getPlayerStat(index, mapGame.lineup.team2.support2, formData.team2Id).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                      <span class="stat-label">最后一击</span>
                    </el-form-item>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 提交按钮 -->
      <div class="form-actions">
        <el-button type="primary" :loading="store.state.loading" @click="submitForm">
          <el-icon v-if="store.state.loading"><Loading /></el-icon>
          {{ store.state.loading ? '提交中...' : '提交数据' }}
        </el-button>
        <el-button @click="resetForm" :disabled="store.state.loading">重置</el-button>
      </div>
    </el-form>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useStore } from 'vuex';

import { ElMessage } from 'element-plus';

export default {
  name: 'DataEntry',
  setup() {
    const store = useStore();
    const formRef = ref(null);

    // 表单数据
    const formData = ref({
      seasonId: '',
      matchDate: '',
      team1Id: '',
      team2Id: '',
      winnerId: '',
      mapGames: []
    });

    // 表单验证规则
    const rules = {
      seasonId: [{ required: true, message: '请选择赛季', trigger: ['change', 'blur'] }],
      matchDate: [{ required: true, message: '请选择比赛日期', trigger: ['change', 'blur'] }],
      team1Id: [{ required: true, message: '请选择队伍1', trigger: ['change', 'blur'] }],
      team2Id: [{ required: true, message: '请选择队伍2', trigger: ['change', 'blur'] }],
      winnerId: [{ required: true, message: '请选择获胜队伍', trigger: ['change', 'blur'] }]
    };
    


    // 计算属性
    const seasons = computed(() => store.state.seasons);
    const teams = computed(() => store.state.teams);
    const maps = computed(() => store.state.maps);
    const heroes = computed(() => store.state.heroes);
    
    // 赛季参赛队伍
    const seasonTeams = computed(() => {
      if (!formData.value.seasonId) return [];
      // 从store中获取赛季参赛队伍
      return store.getters.getTeamsBySeasonId(formData.value.seasonId);
    });
    
    // 队伍1选手
    const team1Players = computed(() => {
      if (!formData.value.seasonId || !formData.value.team1Id) return [];
      // 获取赛季-队伍关联
      const seasonTeam = store.getters.getSeasonTeamBySeasonAndTeam(formData.value.seasonId, formData.value.team1Id);
      if (!seasonTeam) return [];
      // 根据赛季-队伍关联获取选手
      return store.getters.getPlayersBySeasonTeamId(seasonTeam.id);
    });
    
    // 队伍2选手
    const team2Players = computed(() => {
      if (!formData.value.seasonId || !formData.value.team2Id) return [];
      // 获取赛季-队伍关联
      const seasonTeam = store.getters.getSeasonTeamBySeasonAndTeam(formData.value.seasonId, formData.value.team2Id);
      if (!seasonTeam) return [];
      // 根据赛季-队伍关联获取选手
      return store.getters.getPlayersBySeasonTeamId(seasonTeam.id);
    });

    // 获取队伍名称
    const getTeamName = (teamId) => {
      const team = store.getters.getTeamById(teamId);
      return team ? team.name : '';
    };

    // 获取选手名称
    const getPlayerName = (playerId) => {
      const player = store.getters.getPlayerById(playerId);
      return player ? player.name : '';
    };

    // 获取选手角色文本
    const getRoleText = (role) => {
      const roleMap = {
        tank: '坦克',
        damage: '输出',
        support: '辅助'
      };
      return roleMap[role] || role;
    };

    // 赛季变化监听器
    watch(() => formData.value.seasonId, async (newSeasonId) => {
      // 当赛季变化时，重置队伍选择
      formData.value.team1Id = '';
      formData.value.team2Id = '';
      formData.value.winnerId = '';
      // 清空地图局数据
      formData.value.mapGames = [];
      
      // 加载赛季的参赛队伍
      if (newSeasonId) {
        try {
          // 首先加载所有基础数据，确保队伍信息完整
          await store.dispatch('loadBaseData');
          // 然后加载该赛季的队伍关联
          await store.dispatch('getSeasonTeams', newSeasonId);
          // 验证加载结果
          const loadedTeams = store.getters.getTeamsBySeasonId(newSeasonId);
          console.log('加载的赛季队伍:', loadedTeams);
        } catch (error) {
          ElMessage.error('加载赛季队伍失败: ' + error.message);
        }
      }
    });

    // 处理队伍选择变化
    const handleTeamChange = async (teamType) => {
      // 当队伍变化时，清空相关数据
      if (teamType === 'team1' && formData.value.team1Id === formData.value.team2Id) {
        formData.value.team2Id = '';
      }
      if (teamType === 'team2' && formData.value.team1Id === formData.value.team2Id) {
        formData.value.team1Id = '';
      }
      // 重置获胜队伍
      if (formData.value.winnerId && formData.value.winnerId !== formData.value.team1Id && formData.value.winnerId !== formData.value.team2Id) {
        formData.value.winnerId = '';
      }
      
      // 加载队伍的选手数据
      if (formData.value.seasonId) {
        if (formData.value.team1Id) {
          const seasonTeam1 = store.getters.getSeasonTeamBySeasonAndTeam(formData.value.seasonId, formData.value.team1Id);
          if (seasonTeam1) {
            try {
              await store.dispatch('getSeasonTeamPlayers', seasonTeam1.id);
            } catch (error) {
              ElMessage.error('加载队伍1选手失败: ' + error.message);
            }
          }
        }
        if (formData.value.team2Id) {
          const seasonTeam2 = store.getters.getSeasonTeamBySeasonAndTeam(formData.value.seasonId, formData.value.team2Id);
          if (seasonTeam2) {
            try {
              await store.dispatch('getSeasonTeamPlayers', seasonTeam2.id);
            } catch (error) {
              ElMessage.error('加载队伍2选手失败: ' + error.message);
            }
          }
        }
      }
      
      // 更新地图局中的选手数据
      formData.value.mapGames.forEach((mapGame, index) => {
        updateMapGamePlayers(index);
      });
    };

    // 处理选手选择变化
    const handlePlayerChange = (mapGameIndex, teamKey, roleKey) => {
      const mapGame = formData.value.mapGames[mapGameIndex];
      if (!mapGame) return;

      const playerId = mapGame.lineup[teamKey][roleKey];
      const teamId = teamKey === 'team1' ? formData.value.team1Id : formData.value.team2Id;

      // 移除旧选手的统计数据
      mapGame.playerStats = mapGame.playerStats.filter(stat => 
        !(stat.teamId === teamId && stat.playerId !== playerId)
      );

      // 如果新选手还没有统计数据，创建一个
      if (playerId) {
        const existingStat = mapGame.playerStats.find(stat => 
          stat.playerId === playerId && stat.teamId === teamId
        );
        if (!existingStat) {
          mapGame.playerStats.push({
            playerId: playerId,
            teamId: teamId,
            heroId: '',
            kills: 0,
            deaths: 0,
            assists: 0,
            damage: 0,
            healing: 0,
            mitigation: 0,
            ultsUsed: 0,
            finalBlows: 0
          });
        }
      }
    };

    // 添加地图局
    const addMapGame = () => {
      const newMapGame = {
        mapId: '',
        duration: 1,
        winnerId: '',
        team1BanHeroId: '',
        team2BanHeroId: '',
        lineup: {
          team1: {
            tank: '',
            dps1: '',
            dps2: '',
            support1: '',
            support2: ''
          },
          team2: {
            tank: '',
            dps1: '',
            dps2: '',
            support1: '',
            support2: ''
          }
        },
        playerStats: []
      };
      formData.value.mapGames.push(newMapGame);
      // 更新选手数据
      updateMapGamePlayers(formData.value.mapGames.length - 1);
      // 填充默认阵容
      fillDefaultLineup(formData.value.mapGames.length - 1);
    };

    // 删除地图局
    const removeMapGame = (index) => {
      formData.value.mapGames.splice(index, 1);
    };

    // 填充默认阵容
    const fillDefaultLineup = (index) => {
      const mapGame = formData.value.mapGames[index];
      if (!mapGame) return;

      // 填充队伍1默认阵容
      if (formData.value.team1Id) {
        // 坦克
        const tankPlayers = team1Players.value.filter(p => p.role === 'tank').sort((a, b) => a.id - b.id);
        if (tankPlayers.length > 0) {
          mapGame.lineup.team1.tank = tankPlayers[0].id;
        }
        // 输出
        const dpsPlayers = team1Players.value.filter(p => p.role === 'damage').sort((a, b) => a.id - b.id);
        if (dpsPlayers.length > 0) {
          mapGame.lineup.team1.dps1 = dpsPlayers[0].id;
        }
        if (dpsPlayers.length > 1) {
          mapGame.lineup.team1.dps2 = dpsPlayers[1].id;
        }
        // 辅助
        const supportPlayers = team1Players.value.filter(p => p.role === 'support').sort((a, b) => a.id - b.id);
        if (supportPlayers.length > 0) {
          mapGame.lineup.team1.support1 = supportPlayers[0].id;
        }
        if (supportPlayers.length > 1) {
          mapGame.lineup.team1.support2 = supportPlayers[1].id;
        }
      }

      // 填充队伍2默认阵容
      if (formData.value.team2Id) {
        // 坦克
        const tankPlayers = team2Players.value.filter(p => p.role === 'tank').sort((a, b) => a.id - b.id);
        if (tankPlayers.length > 0) {
          mapGame.lineup.team2.tank = tankPlayers[0].id;
        }
        // 输出
        const dpsPlayers = team2Players.value.filter(p => p.role === 'damage').sort((a, b) => a.id - b.id);
        if (dpsPlayers.length > 0) {
          mapGame.lineup.team2.dps1 = dpsPlayers[0].id;
        }
        if (dpsPlayers.length > 1) {
          mapGame.lineup.team2.dps2 = dpsPlayers[1].id;
        }
        // 辅助
        const supportPlayers = team2Players.value.filter(p => p.role === 'support').sort((a, b) => a.id - b.id);
        if (supportPlayers.length > 0) {
          mapGame.lineup.team2.support1 = supportPlayers[0].id;
        }
        if (supportPlayers.length > 1) {
          mapGame.lineup.team2.support2 = supportPlayers[1].id;
        }
      }
    };

    // 更新地图局中的选手数据
    const updateMapGamePlayers = (index) => {
      const mapGame = formData.value.mapGames[index];
      if (!mapGame) return;

      // 清空现有选手数据
      mapGame.playerStats = [];

      // 初始化阵容数据
      if (!mapGame.lineup) {
        mapGame.lineup = {
          team1: {
            tank: '',
            dps1: '',
            dps2: '',
            support1: '',
            support2: ''
          },
          team2: {
            tank: '',
            dps1: '',
            dps2: '',
            support1: '',
            support2: ''
          }
        };
      }

      // 填充默认阵容
      fillDefaultLineup(index);
    };

    // 获取选手统计数据
    const getPlayerStat = (mapGameIndex, playerId, teamId) => {
      const mapGame = formData.value.mapGames[mapGameIndex];
      if (!mapGame) return {};

      let playerStat = mapGame.playerStats.find(stat => stat.playerId === playerId && stat.teamId === teamId);
      if (!playerStat) {
        // 如果不存在，创建一个新的
        playerStat = {
          playerId: playerId,
          teamId: teamId,
          heroId: '',
          kills: 0,
          deaths: 0,
          assists: 0,
          damage: 0,
          healing: 0,
          mitigation: 0,
          ultsUsed: 0,
          finalBlows: 0
        };
        mapGame.playerStats.push(playerStat);
      }
      return playerStat;
    };

    // 获取选手统计数据索引
    const getPlayerStatIndex = (mapGameIndex, playerId, teamId) => {
      const mapGame = formData.value.mapGames[mapGameIndex];
      if (!mapGame) return -1;
      return mapGame.playerStats.findIndex(stat => stat.playerId === playerId && stat.teamId === teamId);
    };

    // 根据选手职责筛选英雄
    const getFilteredHeroes = (playerRole) => {
      return heroes.value.filter(hero => hero.role === playerRole);
    };

    // 提交表单
    const submitForm = async () => {
      if (!formRef.value) return;
      
      await formRef.value.validate(async (valid) => {
        if (valid) {
          // 验证地图局数据
          let mapGamesValid = true;
          const validationErrors = [];
          
          formData.value.mapGames.forEach((mapGame, mapIndex) => {
            // 验证地图选择
            if (!mapGame.mapId) {
              validationErrors.push(`地图局 ${mapIndex + 1}: 请选择地图`);
              mapGamesValid = false;
            }
            
            // 验证时长
            if (!mapGame.duration || mapGame.duration <= 0) {
              validationErrors.push(`地图局 ${mapIndex + 1}: 请输入有效的时长`);
              mapGamesValid = false;
            }
            
            // 验证获胜队伍
            if (!mapGame.winnerId) {
              validationErrors.push(`地图局 ${mapIndex + 1}: 请选择获胜队伍`);
              mapGamesValid = false;
            }
            
            // 验证选手数据
            mapGame.playerStats.forEach((playerStat, statIndex) => {
              if (playerStat.heroId) {
                // 验证选手统计数据
                if (playerStat.kills < 0) {
                  validationErrors.push(`地图局 ${mapIndex + 1} 选手 ${statIndex + 1}: 击杀数不能为负数`);
                  mapGamesValid = false;
                }
                if (playerStat.deaths < 0) {
                  validationErrors.push(`地图局 ${mapIndex + 1} 选手 ${statIndex + 1}: 死亡数不能为负数`);
                  mapGamesValid = false;
                }
                if (playerStat.assists < 0) {
                  validationErrors.push(`地图局 ${mapIndex + 1} 选手 ${statIndex + 1}: 助攻数不能为负数`);
                  mapGamesValid = false;
                }
                if (playerStat.damage < 0) {
                  validationErrors.push(`地图局 ${mapIndex + 1} 选手 ${statIndex + 1}: 伤害不能为负数`);
                  mapGamesValid = false;
                }
                if (playerStat.healing < 0) {
                  validationErrors.push(`地图局 ${mapIndex + 1} 选手 ${statIndex + 1}: 治疗不能为负数`);
                  mapGamesValid = false;
                }
                if (playerStat.mitigation < 0) {
                  validationErrors.push(`地图局 ${mapIndex + 1} 选手 ${statIndex + 1}: 抵挡不能为负数`);
                  mapGamesValid = false;
                }
                if (playerStat.ultsUsed < 0) {
                  validationErrors.push(`地图局 ${mapIndex + 1} 选手 ${statIndex + 1}: 大招数不能为负数`);
                  mapGamesValid = false;
                }
                if (playerStat.finalBlows < 0) {
                  validationErrors.push(`地图局 ${mapIndex + 1} 选手 ${statIndex + 1}: 最后一击数不能为负数`);
                  mapGamesValid = false;
                }
              }
            });
          });
          
          if (!mapGamesValid) {
            // 显示验证错误
            validationErrors.forEach(error => {
              ElMessage.warning(error);
            });
            return;
          }
          
          try {
            // 构建提交数据
            const submitData = {
              ...formData.value,
              mapGames: formData.value.mapGames.map(mapGame => ({
                ...mapGame,
                playerStats: mapGame.playerStats.filter(stat => stat.heroId) // 只提交有英雄选择的选手数据
              }))
            };

            // 提交数据
            await store.dispatch('createMatch', submitData);
            
            // 显示成功消息
            ElMessage.success('数据提交成功');
            
            // 重置表单
            resetForm();
          } catch (error) {
            ElMessage.error('数据提交失败: ' + error.message);
          }
        } else {
          ElMessage.warning('请检查表单数据');
        }
      });
    };

    // 重置表单
    const resetForm = () => {
      formData.value = {
        seasonId: '',
        matchDate: '',
        team1Id: '',
        team2Id: '',
        winnerId: '',
        mapGames: []
      };
      if (formRef.value) {
        formRef.value.resetFields();
      }
    };

    // 组件挂载时加载数据
    onMounted(async () => {
      await store.dispatch('loadBaseData');
    });
    
    // 组件销毁时清理
    onUnmounted(() => {
      // 清理可能的异步操作或事件监听器
    });

    return {
      formData,
      rules,
      formRef,
      seasons,
      teams,
      seasonTeams,
      maps,
      heroes,
      team1Players,
      team2Players,
      getTeamName,
      getPlayerName,
      getRoleText,
      handleTeamChange,
      handlePlayerChange,
      addMapGame,
      removeMapGame,
      getPlayerStat,
      getPlayerStatIndex,
      getFilteredHeroes,
      fillDefaultLineup,
      submitForm,
      resetForm,
      store
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
  font-weight: 600;
  margin-bottom: 30px;
  color: #333;
}

.form-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.teams-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.map-game-item {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.map-game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.map-game-header h4 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.ban-heroes-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
  padding: 15px;
  background-color: #f9f9f9;
  border-radius: 8px;
}

.players-section {
  margin-top: 20px;
}

.players-section h5 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 15px;
}

.players-section h6 {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 10px;
  color: #666;
}

.players-section h7 {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #888;
}

.role-section {
  margin-bottom: 15px;
  padding: 10px;
  background-color: #f9f9f9;
  border-radius: 6px;
}

.player-stats {
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 15px;
}

.player-stats .el-form-item {
  margin-bottom: 10px;
}

.player-stats .el-form-item :deep(.el-form-item__label) {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.player-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.player-name {
  font-weight: 500;
}

.player-role {
  font-size: 12px;
  color: #666;
  background-color: #f0f0f0;
  padding: 2px 8px;
  border-radius: 10px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 10px;
}

.stats-grid .el-form-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.stats-grid .el-form-item :deep(.el-form-item__content) {
  width: 100%;
}

.stat-label {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  text-align: center;
  display: block;
}

.form-actions {
  margin-top: 30px;
  display: flex;
  gap: 10px;
}

.empty-state {
  text-align: center;
  padding: 40px 0;
  color: #999;
}

/* 阵容选择样式 */
.lineup-section {
  margin-top: 20px;
}

.lineup-section h5 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 15px;
}

.team-lineup {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 15px;
}

.team-lineup h6 {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 15px;
  color: #666;
}

.role-slot {
  margin-bottom: 15px;
}

.role-slot label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #888;
}

.slot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .teams-section {
    grid-template-columns: 1fr;
  }
  
  .ban-heroes-section {
    grid-template-columns: 1fr;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .slot-grid {
    grid-template-columns: 1fr;
  }
  
  .form-actions {
    flex-direction: column;
  }
  
  .form-actions .el-button {
    width: 100%;
  }
  
  .map-game-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .player-stats {
    padding: 10px;
  }
  
  .role-slot {
    margin-bottom: 10px;
  }
  
  .team-lineup {
    padding: 10px;
  }
}

/* 平板设备响应式设计 */
@media (min-width: 769px) and (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  
  .slot-grid {
    grid-template-columns: 1fr 1fr;
  }
  
  .ban-heroes-section {
    grid-template-columns: 1fr 1fr;
  }
}
</style>