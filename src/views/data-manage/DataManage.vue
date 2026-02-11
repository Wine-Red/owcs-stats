<template>
  <div class="data-manage-container">
    <h2 class="page-title">数据管理</h2>

    <!-- 管理标签页 -->
    <el-card class="nav-card">
      <el-tabs v-model="activeTab" @tab-click="handleTabClick">
        <el-tab-pane label="地图局管理" name="matches">
          <el-icon><Map /></el-icon>
          地图局管理
        </el-tab-pane>
        <el-tab-pane label="赛季管理" name="seasons">
          <el-icon><Timer /></el-icon>
          赛季管理
        </el-tab-pane>
        <el-tab-pane label="队伍管理" name="teams">
          <el-icon><UserFilled /></el-icon>
          队伍管理
        </el-tab-pane>
        <el-tab-pane label="选手管理" name="players">
          <el-icon><Star /></el-icon>
          选手管理
        </el-tab-pane>
        <el-tab-pane label="赛季-队伍关联" name="season-teams">
          <el-icon><Link /></el-icon>
          赛季-队伍关联
        </el-tab-pane>
        <el-tab-pane label="赛季-队伍-选手关联" name="season-team-players">
          <el-icon><Connection /></el-icon>
          赛季-队伍-选手关联
        </el-tab-pane>
        <el-tab-pane label="图表管理" name="charts">
          <el-icon><PieChart /></el-icon>
          图表管理
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 图表管理 -->
    <div v-show="activeTab === 'charts'">
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>图表显示配置</span>
            <el-button type="primary" size="small" @click="saveChartConfig">保存配置</el-button>
          </div>
        </template>
        <el-form :model="chartConfig" label-width="120px" class="chart-config-form">
           <h3 class="config-section-title">全局数据统计</h3>
           <el-form-item label="英雄禁用统计">
             <el-switch v-model="chartConfig.heroBan" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
           <el-form-item label="地图选取统计">
             <el-switch v-model="chartConfig.mapPick" active-text="显示" inactive-text="隐藏" />
           </el-form-item>

           <h3 class="config-section-title">详细数据统计</h3>
           <el-form-item label="队伍数据">
             <el-switch v-model="chartConfig.teamStats" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
           <el-form-item label="选手数据">
             <el-switch v-model="chartConfig.playerStats" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
        </el-form>
      </el-card>
    </div>

    <!-- 比赛管理 -->
    <div v-show="activeTab === 'matches'">
      <!-- 筛选条件 -->
    <el-card class="filter-card">
      <el-form :model="filterForm" inline>
        <el-form-item label="赛季">
          <el-select v-model="filterForm.seasonId" placeholder="请选择赛季" style="width: 180px">
            <el-option
              v-for="season in seasons"
              :key="season.id"
              :label="season.name"
              :value="season.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="队伍">
          <el-select v-model="filterForm.teamId" placeholder="请选择队伍" style="width: 180px">
            <el-option
              v-for="team in teams"
              :key="team.id"
              :label="team.name"
              :value="team.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="地图">
          <el-select v-model="filterForm.mapId" placeholder="请选择地图" style="width: 180px">
            <el-option
              v-for="map in maps"
              :key="map.id"
              :label="map.name"
              :value="map.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="创建日期">
          <el-date-picker
            v-model="filterForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchMatches">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="resetFilter">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

      <!-- 地图局列表 -->
      <el-card class="data-card" style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>地图局列表</span>
            <el-button type="success" size="small" @click="showImportDialog">
              <el-icon><Upload /></el-icon>
              导入地图数据
            </el-button>
          </div>
        </template>
        <el-table
          v-loading="loading"
          :data="matches"
          style="width: 100%"
          border
        >
          <el-table-column label="创建时间" width="180">
            <template #default="scope">
              {{ formatDate(scope.row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="赛季" width="180">
            <template #default="scope">
              {{ getSeasonName(scope.row.seasonId) }}
            </template>
          </el-table-column>
          <el-table-column label="地图" width="150">
            <template #default="scope">
              {{ getMapName(scope.row.mapId) }}
            </template>
          </el-table-column>
          <el-table-column label="对阵" width="300">
            <template #default="scope">
              <div class="match-up">
                <span>{{ getTeamName(scope.row.team1Id) }}</span>
                <span class="vs">VS</span>
                <span>{{ getTeamName(scope.row.team2Id) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="时长" width="80">
            <template #default="scope">
              {{ scope.row.duration }} 分钟
            </template>
          </el-table-column>
          <el-table-column label="操作" :width="actionColWidth" fixed="right">
            <template #default="scope">
              <div class="action-buttons">
                <el-button type="warning" size="small" @click="editMapGames(scope.row)">
                  <el-icon><Edit /></el-icon>
                  <span v-if="!isMobile">编辑</span>
                </el-button>
                <el-button type="danger" size="small" @click="deleteMapGame(scope.row.id)">
                  <el-icon><Delete /></el-icon>
                  <span v-if="!isMobile">删除</span>
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-container" v-if="total > 0">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            :total="total"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
        <div v-if="matches.length === 0 && !loading" class="empty-state">
          <p>暂无地图局数据</p>
        </div>
      </el-card>
    </div>

    <!-- 赛季管理 -->
    <div v-show="activeTab === 'seasons'">
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>赛季列表</span>
            <el-button type="primary" size="small" @click="addSeason">
              <el-icon><Plus /></el-icon>
              添加赛季
            </el-button>
          </div>
        </template>
        <el-table
          v-loading="loading"
          :data="seasons"
          style="width: 100%"
          border
        >
          <el-table-column prop="name" label="赛季名称" width="200" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.status === 'in_progress' ? 'success' : 'info'">
                {{ scope.row.status === 'in_progress' ? '进行中' : '已完成' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" :width="actionColWidth" fixed="right">
            <template #default="scope">
              <div class="action-buttons">
                <el-button type="primary" size="small" @click="editSeason(scope.row)">
                  <el-icon><Edit /></el-icon>
                  <span v-if="!isMobile">编辑</span>
                </el-button>
                <el-button type="danger" size="small" @click="deleteSeason(scope.row.id)">
                  <el-icon><Delete /></el-icon>
                  <span v-if="!isMobile">删除</span>
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 队伍管理 -->
    <div v-show="activeTab === 'teams'">
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>队伍列表</span>
            <el-button type="primary" size="small" @click="addTeam">
              <el-icon><Plus /></el-icon>
              添加队伍
            </el-button>
          </div>
        </template>
        <el-table
          v-loading="loading"
          :data="teams"
          style="width: 100%"
          border
        >
          <el-table-column prop="name" label="队伍名称" width="200" />
          <el-table-column label="操作" :width="actionColWidth" fixed="right">
            <template #default="scope">
              <div class="action-buttons">
                <el-button type="primary" size="small" @click="editTeam(scope.row)">
                  <el-icon><Edit /></el-icon>
                  <span v-if="!isMobile">编辑</span>
                </el-button>
                <el-button type="danger" size="small" @click="deleteTeam(scope.row.id)">
                  <el-icon><Delete /></el-icon>
                  <span v-if="!isMobile">删除</span>
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 选手管理 -->
    <div v-show="activeTab === 'players'">
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="8" v-for="role in ['tank', 'damage', 'support']" :key="role">
          <el-card class="data-card">
            <template #header>
              <div class="card-header">
                <span>{{ getRoleText(role) }}列表</span>
                <el-button type="primary" size="small" @click="addPlayer(role)">
                  <el-icon><Plus /></el-icon>
                  添加{{ getRoleText(role) }}
                </el-button>
              </div>
            </template>
            <el-table
              v-loading="loading"
              :data="getPlayersByRole(role)"
              style="width: 100%"
              border
              max-height="600"
            >
              <el-table-column prop="name" label="选手名称" />
              <el-table-column label="操作" :width="actionColWidth" fixed="right">
                <template #default="scope">
                  <div class="action-buttons">
                    <el-button type="primary" size="small" @click="editPlayer(scope.row)">
                      <el-icon><Edit /></el-icon>
                      <span v-if="!isMobile">编辑</span>
                    </el-button>
                    <el-button type="danger" size="small" @click="deletePlayer(scope.row.id)">
                      <el-icon><Delete /></el-icon>
                      <span v-if="!isMobile">删除</span>
                    </el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 赛季-队伍关联管理 -->
    <div v-show="activeTab === 'season-teams'">
      <el-card class="filter-card">
        <el-form :model="seasonTeamFilter" inline>
          <el-form-item label="赛季">
            <el-select v-model="seasonTeamFilter.seasonId" placeholder="请选择赛季" style="width: 180px" @change="loadSeasonTeams">
              <el-option
                v-for="season in seasons"
                :key="season.id"
                :label="season.name"
                :value="season.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="small" @click="addSeasonTeam">
              <el-icon><Plus /></el-icon>
              添加赛季-队伍关联
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
      <el-card class="data-card" style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>赛季-队伍关联列表</span>
          </div>
        </template>
        <el-table
          v-loading="loading"
          :data="seasonTeams"
          style="width: 100%"
          border
        >
          <el-table-column label="赛季" width="180">
            <template #default="scope">
              {{ getSeasonName(scope.row.seasonId) }}
            </template>
          </el-table-column>
          <el-table-column label="队伍" width="180">
            <template #default="scope">
              {{ getTeamName(scope.row.teamId) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" :width="deleteActionColWidth" fixed="right">
            <template #default="scope">
              <div class="action-buttons">
                <el-button type="danger" size="small" @click="deleteSeasonTeam(scope.row.id)">
                  <el-icon><Delete /></el-icon>
                  <span v-if="!isMobile">删除</span>
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 赛季-队伍-选手关联管理 -->
    <div v-show="activeTab === 'season-team-players'">
      <el-card class="filter-card">
        <el-form :model="seasonTeamPlayerFilter" inline>
          <el-form-item label="赛季">
            <el-select v-model="seasonTeamPlayerFilter.seasonId" placeholder="请选择赛季" style="width: 180px" @change="loadSeasonTeamsForPlayers">
              <el-option
                v-for="season in seasons"
                :key="season.id"
                :label="season.name"
                :value="season.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="队伍">
            <el-select v-model="seasonTeamPlayerFilter.seasonTeamId" placeholder="请选择队伍" style="width: 180px" @change="loadSeasonTeamPlayers">
              <el-option
                v-for="seasonTeam in seasonTeams"
                :key="seasonTeam.id"
                :label="getTeamName(seasonTeam.teamId)"
                :value="seasonTeam.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="small" @click="addSeasonTeamPlayer">
              <el-icon><Plus /></el-icon>
              添加选手
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
      <el-card class="data-card" style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>赛季-队伍-选手关联列表</span>
          </div>
        </template>
        <el-table
          v-loading="loading"
          :data="seasonTeamPlayers"
          style="width: 100%"
          border
        >
          <el-table-column label="选手" width="180">
            <template #default="scope">
              {{ scope.row.Player ? scope.row.Player.name : getPlayerName(scope.row.playerId) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" :width="deleteActionColWidth" fixed="right">
            <template #default="scope">
              <div class="action-buttons">
                <el-button type="danger" size="small" @click="deleteSeasonTeamPlayer(scope.row.id)">
                  <el-icon><Delete /></el-icon>
                  <span v-if="!isMobile">删除</span>
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>


    
    <!-- 导入地图数据对话框 -->
    <el-dialog
      v-model="importDialogVisible"
      title="导入地图局数据"
      width="80%"
      destroy-on-close
    >
      <map-data-import @success="handleImportSuccess" />
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="80%"
      destroy-on-close
    >
      <!-- 赛季编辑 -->
      <div v-if="dialogType === 'season'">
        <el-form :model="editForm" :rules="seasonRules" ref="editFormRef" label-width="120px">
          <el-form-item label="赛季名称" prop="name">
            <el-input v-model="editForm.name" placeholder="请输入赛季名称" style="width: 100%" />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-select v-model="editForm.status" placeholder="请选择状态" style="width: 100%">
              <el-option label="进行中" value="in_progress" />
              <el-option label="已完成" value="completed" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      
      <!-- 队伍编辑 -->
    <div v-if="dialogType === 'team'">
      <el-form :model="editForm" :rules="teamRules" ref="editFormRef" label-width="120px">
        <el-form-item label="队伍名称" prop="name">
          <el-input v-model="editForm.name" placeholder="请输入队伍名称" style="width: 100%" />
        </el-form-item>
        <el-form-item label="地区" prop="region">
          <el-input v-model="editForm.region" placeholder="请输入队伍地区" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Logo" prop="logo">
          <el-input v-model="editForm.logo" placeholder="请输入队伍Logo URL" style="width: 100%" />
        </el-form-item>
      </el-form>
    </div>
      
      <!-- 选手编辑 -->
      <div v-if="dialogType === 'player'">
        <el-form :model="editForm" :rules="playerRules" ref="editFormRef" label-width="120px">
          <el-form-item label="选手名称" prop="name">
            <el-input v-model="editForm.name" placeholder="请输入选手名称" style="width: 100%" />
          </el-form-item>
          <el-form-item label="位置" prop="role">
            <el-select v-model="editForm.role" placeholder="请选择位置" style="width: 100%">
              <el-option label="坦克" value="tank" />
              <el-option label="输出" value="damage" />
              <el-option label="辅助" value="support" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      
      <!-- 赛季-队伍关联编辑 -->
      <div v-if="dialogType === 'season-team'">
        <el-form :model="editForm" :rules="seasonTeamRules" ref="editFormRef" label-width="120px">
          <el-form-item label="赛季" prop="seasonId">
            <el-select v-model="editForm.seasonId" placeholder="请选择赛季" style="width: 100%" @change="handleSeasonChangeForTeams">
              <el-option
                v-for="season in seasons"
                :key="season.id"
                :label="season.name"
                :value="season.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="队伍" prop="teamIds">
            <el-select v-model="editForm.teamIds" placeholder="请选择队伍" style="width: 100%" multiple filterable>
              <el-option
                v-for="team in availableTeams"
                :key="team.id"
                :label="team.name"
                :value="team.id"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      
      <!-- 赛季-队伍-选手关联编辑 -->
      <div v-if="dialogType === 'season-team-player'">
        <el-form :model="editForm" :rules="seasonTeamPlayerRules" ref="editFormRef" label-width="120px">
          <el-form-item label="赛季-队伍" prop="seasonTeamId">
            <el-select v-model="editForm.seasonTeamId" placeholder="请选择赛季-队伍" style="width: 100%" @change="handleSeasonTeamChangeForPlayers">
              <el-option
                v-for="seasonTeam in seasonTeams"
                :key="seasonTeam.id"
                :label="getTeamName(seasonTeam.teamId)"
                :value="seasonTeam.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="选手" prop="playerIds">
            <el-select v-model="editForm.playerIds" placeholder="请选择选手" style="width: 100%" multiple filterable>
              <el-option
                v-for="player in availablePlayers"
                :key="player.id"
                :label="player.name"
                :value="player.id"
              >
                <span>{{ player.name }}</span>
                <span style="color: #8492a6; font-size: 12px; margin-left: 10px">
                  ({{ getRoleText(player.role) }})
                </span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveEdit">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 编辑地图局对话框 -->
    <el-dialog
      v-model="mapGameEditDialogVisible"
      title="编辑地图局"
      width="90%"
      destroy-on-close
      @close="resetMapGameEditForm"
    >
      <div v-if="currentMatchForEdit">
        <el-form :model="currentMatchForEdit" label-width="120px">
          <el-form-item label="比赛">
            <span>{{ getTeamName(currentMatchForEdit.team1Id) }} vs {{ getTeamName(currentMatchForEdit.team2Id) }}</span>
          </el-form-item>
        </el-form>

        <div v-if="mapGamesForEdit.length > 0">
          <div v-for="(mapGame, index) in mapGamesForEdit" :key="mapGame.id">
            <el-form :model="mapGame" label-width="120px" style="margin-top: 20px;">
              <el-form-item label="地图">
                <el-select v-model="mapGame.mapId" placeholder="请选择地图" style="width: 100%">
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
              <el-form-item label="获胜队伍">
                <el-select v-model="mapGame.winnerId" placeholder="请选择获胜队伍" style="width: 100%">
                  <el-option
                    :label="getTeamName(currentMatchForEdit.team1Id)"
                    :value="currentMatchForEdit.team1Id"
                  />
                  <el-option
                    :label="getTeamName(currentMatchForEdit.team2Id)"
                    :value="currentMatchForEdit.team2Id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="队伍1 Ban">
                <el-select v-model="mapGame.team1BanHeroId" placeholder="请选择Ban英雄" style="width: 100%" clearable>
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
              <el-form-item label="队伍2 Ban">
                <el-select v-model="mapGame.team2BanHeroId" placeholder="请选择Ban英雄" style="width: 100%" clearable>
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
              <el-form-item label="时长(分钟)">
                <el-input-number
                  v-model="mapGame.duration"
                  :min="1"
                  :max="120"
                  :step="1"
                  style="width: 100%"
                />
              </el-form-item>
            </el-form>

            <el-divider>{{ getTeamName(currentMatchForEdit.team1Id) }} 上场阵容</el-divider>
            <div class="lineup-section">
              <div class="role-section" v-for="role in ['tank', 'damage', 'support']" :key="'team1-' + role" :data-role="role">
                <h4>{{ getRoleText(role) }} ({{ getRoleCount(role) }}人)</h4>
                <div class="player-slots">
                  <div class="player-slot" v-for="(slot, index) in getRoleSlots(role)" :key="'team1-' + role + '-' + index">
                    <div class="player-info">
                      <span class="player-label">选手{{ index + 1 }}:</span>
                      <el-select
                        v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).playerId"
                        :placeholder="'选择' + getRoleText(role) + '选手'"
                        style="width: 100%"
                        @change="handleMapGamePlayerChange(mapGame, 'team1', role, index + 1)"
                      >
                        <el-option
                          v-for="player in getMatchTeamPlayers(currentMatchForEdit, 'team1', role)"
                          :key="player.id"
                          :label="player.name"
                          :value="player.id"
                        />
                      </el-select>
                    </div>
                    <div class="player-stats-form">
                      <el-form-item label="英雄">
                        <el-select
                          v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).heroId"
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
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).kills" :min="0" :controls="false" placeholder="击杀" />
                          <span class="stat-label">击杀</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).deaths" :min="0" :controls="false" placeholder="死亡" />
                          <span class="stat-label">死亡</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).assists" :min="0" :controls="false" placeholder="助攻" />
                          <span class="stat-label">助攻</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).damage" :min="0" :controls="false" placeholder="伤害" />
                          <span class="stat-label">伤害</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).healing" :min="0" :controls="false" placeholder="治疗" />
                          <span class="stat-label">治疗</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                          <span class="stat-label">抵挡</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                          <span class="stat-label">大招</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team1', role, index + 1).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                          <span class="stat-label">最后一击</span>
                        </el-form-item>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <el-divider>{{ getTeamName(currentMatchForEdit.team2Id) }} 上场阵容</el-divider>
            <div class="lineup-section">
              <div class="role-section" v-for="role in ['tank', 'damage', 'support']" :key="'team2-' + role" :data-role="role">
                <h4>{{ getRoleText(role) }} ({{ getRoleCount(role) }}人)</h4>
                <div class="player-slots">
                  <div class="player-slot" v-for="(slot, index) in getRoleSlots(role)" :key="'team2-' + role + '-' + index">
                    <div class="player-info">
                      <span class="player-label">选手{{ index + 1 }}:</span>
                      <el-select
                        v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).playerId"
                        :placeholder="'选择' + getRoleText(role) + '选手'"
                        style="width: 100%"
                        @change="handleMapGamePlayerChange(mapGame, 'team2', role, index + 1)"
                      >
                        <el-option
                          v-for="player in getMatchTeamPlayers(currentMatchForEdit, 'team2', role)"
                          :key="player.id"
                          :label="player.name"
                          :value="player.id"
                        />
                      </el-select>
                    </div>
                    <div class="player-stats-form">
                      <el-form-item label="英雄">
                        <el-select
                          v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).heroId"
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
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).kills" :min="0" :controls="false" placeholder="击杀" />
                          <span class="stat-label">击杀</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).deaths" :min="0" :controls="false" placeholder="死亡" />
                          <span class="stat-label">死亡</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).assists" :min="0" :controls="false" placeholder="助攻" />
                          <span class="stat-label">助攻</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).damage" :min="0" :controls="false" placeholder="伤害" />
                          <span class="stat-label">伤害</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).healing" :min="0" :controls="false" placeholder="治疗" />
                          <span class="stat-label">治疗</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).mitigation" :min="0" :controls="false" placeholder="抵挡" />
                          <span class="stat-label">抵挡</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).ultsUsed" :min="0" :controls="false" placeholder="大招" />
                          <span class="stat-label">大招</span>
                        </el-form-item>
                        <el-form-item>
                          <el-input-number v-model="getMapGamePlayerStat(mapGame, 'team2', role, index + 1).finalBlows" :min="0" :controls="false" placeholder="最后一击" />
                          <span class="stat-label">最后一击</span>
                        </el-form-item>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="mapGameEditDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveMapGameEdit" :loading="mapGameSaving">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { ElMessage, ElMessageBox } from 'element-plus';
import { MapLocation as MapIcon, Timer, UserFilled, Star, Link, Connection, Search, Refresh, Edit, Delete, Plus, PieChart, Upload } from '@element-plus/icons-vue';
import apiService from '../../services/api';
import MapDataImport from './components/MapDataImport.vue';

export default {
  name: 'DataManage',
  components: {
    Map: MapIcon,
    Timer,
    UserFilled,
    Star,
    Link,
    Connection,
    Search,
    Refresh,
    Edit,
    Delete,
    Plus,
    PieChart,
    Upload,
    MapDataImport
  },
  setup() {
    const store = useStore();
    
    // 响应式布局
    const isMobile = ref(window.innerWidth < 768);
    const updateIsMobile = () => {
      isMobile.value = window.innerWidth < 768;
    };

    // 操作栏宽度
    const actionColWidth = computed(() => isMobile.value ? 100 : 180);
    const deleteActionColWidth = computed(() => isMobile.value ? 70 : 100);
    
    // 标签页管理
    const activeTab = ref('matches');
    
    // 筛选表单
    const filterForm = ref({
      seasonId: '',
      teamId: '',
      mapId: '',
      dateRange: []
    });
    
    // 赛季-队伍关联筛选
    const seasonTeamFilter = ref({
      seasonId: ''
    });
    
    // 赛季-队伍-选手关联筛选
    const seasonTeamPlayerFilter = ref({
      seasonId: '',
      seasonTeamId: ''
    });

    // 图表配置
    const chartConfig = ref({
      heroBan: true,
      mapPick: true,
      teamStats: true,
      playerStats: true
    });

    // 加载图表配置
    const loadChartConfig = () => {
      const saved = localStorage.getItem('visualize_chart_config');
      if (saved) {
        try {
          chartConfig.value = JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse chart config', e);
        }
      }
    };

    // 保存图表配置
    const saveChartConfig = () => {
      localStorage.setItem('visualize_chart_config', JSON.stringify(chartConfig.value));
      ElMessage.success('图表配置已保存');
    };
    
    // 比赛列表数据
    const matches = ref([]);
    const loading = ref(false);
    const total = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(10);
    

    
    // 编辑对话框
    const dialogVisible = ref(false);
    const dialogTitle = ref('编辑数据');
    const dialogType = ref('season');
    const editForm = ref({});
    const editFormRef = ref(null);
    

    

    
    // 赛季验证规则
    const seasonRules = {
      name: [{ required: true, message: '请输入赛季名称', trigger: 'blur' }],
      status: [{ required: true, message: '请选择状态', trigger: 'change' }]
    };
    
    // 队伍验证规则
    const teamRules = {
      name: [{ required: true, message: '请输入队伍名称', trigger: 'blur' }],
      region: [{ required: true, message: '请输入队伍地区', trigger: 'blur' }]
    };
    
    // 选手验证规则
    const playerRules = {
      name: [{ required: true, message: '请输入选手名称', trigger: 'blur' }],
      role: [{ required: true, message: '请选择位置', trigger: 'change' }]
    };
    
    // 赛季-队伍关联验证规则
    const seasonTeamRules = {
      seasonId: [{ required: true, message: '请选择赛季', trigger: 'change' }],
      teamIds: [{ type: 'array', required: true, message: '请选择至少一个队伍', trigger: 'change' }]
    };

    // 赛季-队伍-选手关联验证规则
    const seasonTeamPlayerRules = {
      seasonTeamId: [{ required: true, message: '请选择赛季-队伍', trigger: 'change' }],
      playerIds: [{ type: 'array', required: true, message: '请选择至少一个选手', trigger: 'change' }]
    };
    
    // 计算属性
    const seasons = computed(() => store.state.seasons);
    const teams = computed(() => store.state.teams);
    const players = computed(() => store.state.players);
    const seasonTeams = computed(() => store.state.seasonTeams);
    const seasonTeamPlayers = computed(() => store.state.seasonTeamPlayers);

    const availableTeams = computed(() => {
      if (!editForm.value.seasonId) return teams.value;
      const existingTeamIds = seasonTeams.value
        .filter(st => st.seasonId === editForm.value.seasonId)
        .map(st => st.teamId);
      return teams.value.filter(team => !existingTeamIds.includes(team.id));
    });

    const availablePlayers = computed(() => {
      // 按照 role 排序：tank -> damage -> support
      const roleOrder = { tank: 1, damage: 2, support: 3 };
      
      // 过滤掉已经在当前赛季加入其他队伍的选手
      const filteredPlayers = players.value.filter(player => !isPlayerAlreadyInSeason(player.id));
      
      return [...filteredPlayers].sort((a, b) => {
        const orderA = roleOrder[a.role] || 99;
        const orderB = roleOrder[b.role] || 99;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        
        // 如果角色相同，按名字字母顺序排
        return a.name.localeCompare(b.name);
      });
    });
    
    // 检查选手是否已经存在于当前赛季的任何队伍中
    const isPlayerAlreadyInSeason = (playerId) => {
      // 1. 获取当前选中的赛季-队伍关联
      const currentSeasonTeamId = editForm.value.seasonTeamId;
      if (!currentSeasonTeamId) return false;

      // 2. 找到该关联对应的赛季ID
      const currentSeasonTeam = seasonTeams.value.find(st => st.id === currentSeasonTeamId);
      if (!currentSeasonTeam) return false;
      const currentSeasonId = currentSeasonTeam.seasonId;

      // 3. 找到该赛季下所有的赛季-队伍关联ID
      const allSeasonTeamIdsInSeason = seasonTeams.value
        .filter(st => st.seasonId === currentSeasonId)
        .map(st => st.id);

      // 4. 检查该选手是否在这些关联中的任何一个里面
      // 注意：这里需要检查所有已加载的 seasonTeamPlayers
      // 但 store 中的 seasonTeamPlayers 可能只包含当前筛选的，所以可能需要额外的逻辑来获取全量数据
      // 考虑到性能，我们假设 store.state.seasonTeamPlayers 包含我们需要的数据，
      // 或者我们需要在打开对话框时加载该赛季所有队伍的选手数据。
      
      // 更好的做法是在计算属性中处理，或者确保 seasonTeamPlayers 包含了足够的信息。
      // 由于目前的架构限制，我们先基于已有的 seasonTeamPlayers 进行检查。
      // 为了准确性，我们在打开添加对话框时应该加载该赛季所有选手的关联信息。
      
      // 这里我们遍历 store 中的 seasonTeamPlayers，检查是否有匹配 playerId 且 seasonTeamId 属于当前赛季的记录
      const isInSeason = seasonTeamPlayers.value.some(stp => 
        stp.playerId === playerId && allSeasonTeamIdsInSeason.includes(stp.seasonTeamId)
      );

      return isInSeason;
    };

    const maps = computed(() => store.state.maps);
    const heroes = computed(() => store.state.heroes);

    const mapGameEditDialogVisible = ref(false);
    const mapGameEditTab = ref('0');
    const currentMatchForEdit = ref(null);
    const mapGamesForEdit = ref([]);
    const mapGameSaving = ref(false);
    
    // 导入相关
    const importDialogVisible = ref(false);
    
    const showImportDialog = () => {
      importDialogVisible.value = true;
    };
    
    const handleImportSuccess = () => {
      importDialogVisible.value = false;
      loadMatches();
    };
    
    // 获取赛季名称
    const getSeasonName = (seasonId) => {
      const season = store.getters.getSeasonById(seasonId);
      return season ? season.name : '未知赛季';
    };
    
    // 获取队伍名称
    const getTeamName = (teamId) => {
      const team = store.getters.getTeamById(teamId);
      return team ? team.name : '未知队伍';
    };
    
    // 获取选手名称
    const getPlayerName = (playerId) => {
      const player = store.getters.getPlayerById(playerId);
      return player ? player.name : '未知选手';
    };
    
    // 获取选手位置文本
    const getRoleText = (role) => {
      const roleMap = {
        tank: '坦克',
        damage: '输出',
        support: '辅助'
      };
      return roleMap[role] || role;
    };
    
    // 获取选手位置标签类型
    const getRoleType = (role) => {
      const typeMap = {
        tank: 'warning',
        damage: 'danger',
        support: 'success'
      };
      return typeMap[role] || 'info';
    };
    
    // 获取地图名称
    const getMapName = (mapId) => {
      const map = store.getters.getMapById(mapId);
      return map ? map.name : '未知地图';
    };
    
    // 获取英雄名称
    const getHeroName = (heroId) => {
      const hero = store.getters.getHeroById(heroId);
      return hero ? hero.name : '无';
    };

    // 格式化日期
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    };
    

    
    // 加载地图局数据
    const loadMatches = async () => {
      loading.value = true;
      try {
        // 构建筛选条件，只传递有值的参数
        const filters = {};
        if (filterForm.value.seasonId) {
          filters.seasonId = filterForm.value.seasonId;
        }
        if (filterForm.value.teamId) {
          filters.teamId = filterForm.value.teamId;
        }
        if (filterForm.value.mapId) {
          filters.mapId = filterForm.value.mapId;
        }
        if (filterForm.value.dateRange && filterForm.value.dateRange[0]) {
          filters.startDate = filterForm.value.dateRange[0];
        }
        if (filterForm.value.dateRange && filterForm.value.dateRange[1]) {
          filters.endDate = filterForm.value.dateRange[1];
        }
        filters.page = currentPage.value;
        filters.pageSize = pageSize.value;
        
        console.log('发送筛选条件:', filters);
        
        // 直接调用API服务，绕过store，以便获取更详细的错误信息
        const result = await apiService.getMapGames(filters);
        
        // 处理返回的数据，支持多种可能的返回格式
        let mapGamesData = [];
        if (Array.isArray(result)) {
          mapGamesData = result;
        } else if (result && result.data && Array.isArray(result.data)) {
          mapGamesData = result.data;
        } else if (result && result.list && Array.isArray(result.list)) {
          mapGamesData = result.list;
        } else if (result && result.items && Array.isArray(result.items)) {
          mapGamesData = result.items;
        }
        
        matches.value = mapGamesData;
        total.value = mapGamesData.length;
        
        console.log('加载地图局数据成功，共', mapGamesData.length, '条');
      } catch (error) {
        console.error('加载地图局数据失败:', error);
        const errorMessage = error.response?.data?.error || error.message || '未知错误';
        ElMessage.error('加载地图局数据失败: ' + errorMessage);
        matches.value = [];
        total.value = 0;
      } finally {
        loading.value = false;
      }
    };
    
    // 加载赛季-队伍关联数据
    const loadSeasonTeams = async () => {
      // 先清空列表，避免显示旧数据
      store.commit('setSeasonTeams', []);
      
      if (seasonTeamFilter.value.seasonId) {
        try {
          const seasonId = seasonTeamFilter.value.seasonId;
          const allSeasonTeams = await apiService.getAllSeasonTeams();
          const filteredSeasonTeams = allSeasonTeams.filter(st => st.seasonId === seasonId);
          store.commit('setSeasonTeams', filteredSeasonTeams);
        } catch (error) {
          ElMessage.error('加载赛季-队伍关联失败: ' + error.message);
        }
      }
    };
    
    // 加载赛季-队伍-选手关联数据
    const loadSeasonTeamPlayers = async () => {
      // 先清空列表，避免显示旧数据
      store.commit('setSeasonTeamPlayers', []);
      
      if (seasonTeamPlayerFilter.value.seasonTeamId) {
        try {
          await store.dispatch('getSeasonTeamPlayers', seasonTeamPlayerFilter.value.seasonTeamId);
        } catch (error) {
          ElMessage.error('加载赛季-队伍-选手关联失败: ' + error.message);
        }
      }
    };
    
    // 加载赛季队伍用于选手关联
    const loadSeasonTeamsForPlayers = async () => {
      // 先清空列表，避免显示旧数据
      store.commit('setSeasonTeams', []);
      store.commit('setSeasonTeamPlayers', []);
      
      if (seasonTeamPlayerFilter.value.seasonId) {
        try {
          const seasonId = seasonTeamPlayerFilter.value.seasonId;
          const allSeasonTeams = await apiService.getAllSeasonTeams();
          const filteredSeasonTeams = allSeasonTeams.filter(st => st.seasonId === seasonId);
          store.commit('setSeasonTeams', filteredSeasonTeams);
          seasonTeamPlayerFilter.value.seasonTeamId = '';
        } catch (error) {
          ElMessage.error('加载赛季-队伍关联失败: ' + error.message);
        }
      }
    };

    const handleSeasonChangeForTeams = () => {
      editForm.value.teamIds = [];
    };

    const handleSeasonTeamChangeForPlayers = () => {
      editForm.value.playerIds = [];
    };
    
    // 搜索比赛
    const searchMatches = () => {
      currentPage.value = 1;
      loadMatches();
    };
    
    // 重置筛选
    const resetFilter = () => {
      filterForm.value = {
        seasonId: '',
        teamId: '',
        mapId: '',
        dateRange: []
      };
      currentPage.value = 1;
      loadMatches();
    };
    
    // 处理分页大小变化
    const handleSizeChange = (size) => {
      pageSize.value = size;
      loadMatches();
    };
    
    // 处理页码变化
    const handleCurrentChange = (current) => {
      currentPage.value = current;
      loadMatches();
    };
    

    
    // 处理标签页切换
    const handleTabClick = () => {
      // 切换标签页时的处理逻辑
      if (activeTab.value === 'season-teams') {
        loadSeasonTeams();
      } else if (activeTab.value === 'season-team-players') {
        loadSeasonTeamsForPlayers();
      } else if (activeTab.value === 'charts') {
        loadChartConfig();
      }
    };
    


    // 编辑地图局
    const editMapGames = async (mapGame) => {
      try {
        console.log('开始编辑地图局，ID:', mapGame.id);
        
        // 创建地图局的比赛信息对象，用于显示队伍对阵
        currentMatchForEdit.value = {
          team1Id: mapGame.team1Id,
          team2Id: mapGame.team2Id,
          seasonId: mapGame.seasonId
        };
        
        // 确保加载了相关的赛季-队伍和选手数据
        try {
          // 1. 加载所有赛季-队伍关联
          const allSeasonTeams = await apiService.getAllSeasonTeams();
          store.commit('setSeasonTeams', allSeasonTeams);

          // 2. 找到当前比赛两支队伍的赛季关联ID
          const seasonTeam1 = allSeasonTeams.find(st => 
            st.seasonId === mapGame.seasonId && st.teamId === mapGame.team1Id
          );
          const seasonTeam2 = allSeasonTeams.find(st => 
            st.seasonId === mapGame.seasonId && st.teamId === mapGame.team2Id
          );

          // 3. 加载这两支队伍的选手列表
          if (seasonTeam1) {
            await store.dispatch('getSeasonTeamPlayers', seasonTeam1.id);
          }
          if (seasonTeam2) {
            await store.dispatch('getSeasonTeamPlayers', seasonTeam2.id);
          }
        } catch (e) {
          console.error('加载队伍选手数据失败:', e);
          ElMessage.warning('加载队伍选手数据失败，部分选手可能无法显示');
        }

        console.log('获取地图局的选手数据，ID:', mapGame.id);
        // 获取地图局的选手数据
        const playerStats = await apiService.getMapGamePlayerStats(mapGame.id);
        console.log('获取到选手数据:', playerStats);
        
        // 为选手数据添加 _slotKey 字段，用于匹配界面上的位置
        const playerStatsWithSlotKey = [];
        
        // 按队伍和角色分组
        const team1Stats = (playerStats || []).filter(stat => stat.teamId === mapGame.team1Id);
        const team2Stats = (playerStats || []).filter(stat => stat.teamId === mapGame.team2Id);
        
        // 为每个队伍分配选手数据到位置
        const assignStatsToSlots = (stats, teamKey) => {
          const teamId = teamKey === 'team1' ? mapGame.team1Id : mapGame.team2Id;
          
          // 按角色分组
          const statsByRole = {
            tank: stats.filter(stat => {
              const player = stat.player || players.value.find(p => p.id === stat.playerId);
              return player && player.role === 'tank';
            }),
            damage: stats.filter(stat => {
              const player = stat.player || players.value.find(p => p.id === stat.playerId);
              return player && player.role === 'damage';
            }),
            support: stats.filter(stat => {
              const player = stat.player || players.value.find(p => p.id === stat.playerId);
              return player && player.role === 'support';
            })
          };
          
          // 按角色分配位置：坦克1个，输出2个，辅助2个
          const roleConfig = {
            tank: 1,
            damage: 2,
            support: 2
          };
          
          Object.entries(roleConfig).forEach(([role, count]) => {
            for (let index = 1; index <= count; index++) {
              const slotKey = `${teamKey}-${role}${index}`;
              
              // 获取该角色的选手数据
              const roleStats = statsByRole[role] || [];
              const stat = roleStats[index - 1]; // 按顺序获取
              
              if (stat) {
                playerStatsWithSlotKey.push({
                  ...stat,
                  _slotKey: slotKey
                });
              } else {
                // 如果没有找到匹配的选手数据，创建一个空的占位符
                playerStatsWithSlotKey.push({
                  playerId: '',
                  heroId: '',
                  kills: 0,
                  deaths: 0,
                  assists: 0,
                  damage: 0,
                  healing: 0,
                  mitigation: 0,
                  ultsUsed: 0,
                  finalBlows: 0,
                  teamId: teamId,
                  _slotKey: slotKey
                });
              }
            }
          });
        };
        
        assignStatsToSlots(team1Stats, 'team1');
        assignStatsToSlots(team2Stats, 'team2');
        
        mapGame.playerStats = playerStatsWithSlotKey;
        
        // 将单个地图局放入编辑数组
        mapGamesForEdit.value = [mapGame];
        mapGameEditTab.value = '0';
        mapGameEditDialogVisible.value = true;
      } catch (error) {
        console.error('编辑地图局失败:', error);
        const errorMessage = error.response?.data?.error || error.message || '未知错误';
        ElMessage.error('加载地图局数据失败: ' + errorMessage);
      }
    };

    const resetMapGameEditForm = () => {
      currentMatchForEdit.value = null;
      mapGamesForEdit.value = [];
      mapGameEditTab.value = '0';
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

    const getHeroesByRole = (role) => {
      return heroes.value.filter(hero => hero.role === role);
    };

    const getMatchTeamPlayers = (match, teamKey, role) => {
      const teamId = teamKey === 'team1' ? match.team1Id : match.team2Id;
      const seasonTeam = store.getters.getSeasonTeamBySeasonAndTeam(match.seasonId, teamId);
      if (!seasonTeam) return [];
      const players = store.getters.getPlayersBySeasonTeamId(seasonTeam.id);
      return players.filter(p => p.role === role);
    };

    const getMapGamePlayerStat = (mapGame, teamKey, role, index) => {
      const teamId = teamKey === 'team1' ? mapGame.team1Id : mapGame.team2Id;
      const slotKey = `${teamKey}-${role}${index}`;
      
      let stat = mapGame.playerStats.find(ps => ps.teamId === teamId && ps._slotKey === slotKey);
      
      if (!stat) {
        stat = {
          playerId: '',
          heroId: '',
          kills: 0,
          deaths: 0,
          assists: 0,
          damage: 0,
          healing: 0,
          mitigation: 0,
          ultsUsed: 0,
          finalBlows: 0,
          teamId: teamId,
          _slotKey: slotKey
        };
        mapGame.playerStats.push(stat);
      }
      
      return stat;
    };

    const handleMapGamePlayerChange = (mapGame, teamKey, role, index) => {
      const stat = getMapGamePlayerStat(mapGame, teamKey, role, index);
      if (stat.playerId) {
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

    const saveMapGameEdit = async () => {
      mapGameSaving.value = true;
      try {
        for (const mapGame of mapGamesForEdit.value) {
          const playerStats = mapGame.playerStats
            .filter(ps => ps.playerId)
            .map(ps => ({
              playerId: ps.playerId,
              teamId: ps.teamId,
              heroId: ps.heroId || null,
              kills: ps.kills,
              deaths: ps.deaths,
              assists: ps.assists,
              damage: ps.damage,
              healing: ps.healing,
              mitigation: ps.mitigation,
              ultsUsed: ps.ultsUsed,
              finalBlows: ps.finalBlows
            }));
          
          await apiService.updateMapGame(mapGame.id, {
            mapId: mapGame.mapId,
            winnerId: mapGame.winnerId,
            team1BanHeroId: mapGame.team1BanHeroId,
            team2BanHeroId: mapGame.team2BanHeroId,
            duration: mapGame.duration,
            playerStats: playerStats
          });
        }
        
        ElMessage.success('地图局数据保存成功');
        mapGameEditDialogVisible.value = false;
        await loadMatches();
      } catch (error) {
        ElMessage.error('保存地图局数据失败: ' + error.message);
      } finally {
        mapGameSaving.value = false;
      }
    };
    
    // 删除地图局
    const deleteMapGame = async (mapGameId) => {
      try {
        await ElMessageBox.confirm(
          '确定要删除这个地图局吗？此操作不可恢复。',
          '确认删除',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        );
        
        await apiService.deleteMapGame(mapGameId);
        ElMessage.success('地图局删除成功');
        await loadMatches();
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除地图局失败: ' + error.message);
        }
      }
    };
    
    // 添加赛季
    const addSeason = () => {
      dialogTitle.value = '添加赛季';
      dialogType.value = 'season';
      editForm.value = {
        name: '',
        status: 'in_progress'
      };
      dialogVisible.value = true;
    };
    
    // 编辑赛季
    const editSeason = (season) => {
      dialogTitle.value = '编辑赛季';
      dialogType.value = 'season';
      // 深拷贝赛季数据
      editForm.value = JSON.parse(JSON.stringify(season));
      dialogVisible.value = true;
    };
    
    // 添加队伍
    const addTeam = () => {
      dialogTitle.value = '添加队伍';
      dialogType.value = 'team';
      editForm.value = {
        name: '',
        region: '',
        logo: ''
      };
      dialogVisible.value = true;
    };
    
    // 编辑队伍
    const editTeam = (team) => {
      dialogTitle.value = '编辑队伍';
      dialogType.value = 'team';
      // 深拷贝队伍数据
      editForm.value = JSON.parse(JSON.stringify(team));
      dialogVisible.value = true;
    };
    
    // 获取指定位置的选手列表
    const getPlayersByRole = (role) => {
      return players.value.filter(player => player.role === role);
    };

    // 添加选手
    const addPlayer = (role = 'tank') => {
      dialogTitle.value = '添加选手';
      dialogType.value = 'player';
      editForm.value = {
        name: '',
        role: role // 默认使用传入的位置，如果没有传入则默认为tank
      };
      dialogVisible.value = true;
    };
    
    // 编辑选手
    const editPlayer = (player) => {
      dialogTitle.value = '编辑选手';
      dialogType.value = 'player';
      // 深拷贝选手数据
      editForm.value = JSON.parse(JSON.stringify(player));
      dialogVisible.value = true;
    };
    
    // 添加赛季-队伍关联
    const addSeasonTeam = () => {
      dialogTitle.value = '添加赛季-队伍关联';
      dialogType.value = 'season-team';
      editForm.value = {
        seasonId: seasonTeamFilter.value.seasonId || '',
        teamIds: []
      };
      dialogVisible.value = true;
    };
    
    // 添加赛季-队伍-选手关联
    const addSeasonTeamPlayer = async () => {
      dialogTitle.value = '添加赛季-队伍-选手关联';
      dialogType.value = 'season-team-player';
      editForm.value = {
        seasonTeamId: seasonTeamPlayerFilter.value.seasonTeamId || '',
        playerIds: []
      };
      
      // 如果已经选择了 seasonTeamId，我们需要确保加载了该赛季下所有队伍的选手数据，以便正确判断选手是否已存在
      const seasonTeamId = editForm.value.seasonTeamId;
      if (seasonTeamId) {
        const currentSeasonTeam = seasonTeams.value.find(st => st.id === seasonTeamId);
        if (currentSeasonTeam) {
           const seasonId = currentSeasonTeam.seasonId;
           // 找到该赛季下的所有 seasonTeamId
           const seasonTeamIds = seasonTeams.value
             .filter(st => st.seasonId === seasonId)
             .map(st => st.id);
            
           // 并行加载所有相关队伍的选手数据
           // 注意：这里可能会发起较多请求，如果赛季队伍很多，可以考虑后端增加一个接口一次性获取
           try {
             const promises = seasonTeamIds.map(id => store.dispatch('getSeasonTeamPlayers', id));
             await Promise.all(promises);
           } catch (e) {
             console.error('加载赛季选手数据失败', e);
           }
        }
      }
      
      dialogVisible.value = true;
    };
    
    // 保存编辑
    const saveEdit = async () => {
      if (!editFormRef.value) return;
      
      await editFormRef.value.validate(async (valid) => {
        if (valid) {
          try {
            switch (dialogType.value) {
              case 'match':
                if (editForm.value.id) {
                  await store.dispatch('updateMatch', {
                    id: editForm.value.id,
                    matchData: editForm.value
                  });
                  ElMessage.success('比赛数据更新成功');
                } else {
                  await store.dispatch('createMatch', editForm.value);
                  ElMessage.success('比赛数据添加成功');
                }
                loadMatches();
                break;
              case 'season':
                if (editForm.value.id) {
                  await store.dispatch('updateSeason', {
                    id: editForm.value.id,
                    seasonData: editForm.value
                  });
                  ElMessage.success('赛季数据更新成功');
                } else {
                  await store.dispatch('createSeason', editForm.value);
                  ElMessage.success('赛季数据添加成功');
                }
                // 重新加载赛季数据
                await store.dispatch('loadBaseData');
                break;
              case 'team':
                if (editForm.value.id) {
                  await store.dispatch('updateTeam', {
                    id: editForm.value.id,
                    teamData: editForm.value
                  });
                  ElMessage.success('队伍数据更新成功');
                } else {
                  await store.dispatch('createTeam', editForm.value);
                  ElMessage.success('队伍数据添加成功');
                }
                // 重新加载队伍数据
                await store.dispatch('loadBaseData');
                break;
              case 'player':
                if (editForm.value.id) {
                  await store.dispatch('updatePlayer', {
                    id: editForm.value.id,
                    playerData: editForm.value
                  });
                  ElMessage.success('选手数据更新成功');
                } else {
                  await store.dispatch('createPlayer', editForm.value);
                  ElMessage.success('选手数据添加成功');
                }
                // 重新加载选手数据
                await store.dispatch('loadBaseData');
                break;
              case 'season-team':
                if (editForm.value.teamIds && editForm.value.teamIds.length > 0) {
                  const result = await store.dispatch('bulkCreateSeasonTeams', {
                    seasonId: editForm.value.seasonId,
                    teamIds: editForm.value.teamIds
                  });
                  ElMessage.success(result.message || '赛季-队伍关联添加成功');
                  loadSeasonTeams();
                }
                break;
              case 'season-team-player':
                if (editForm.value.playerIds && editForm.value.playerIds.length > 0) {
                  const result = await store.dispatch('bulkCreateSeasonTeamPlayers', {
                    seasonTeamId: editForm.value.seasonTeamId,
                    playerIds: editForm.value.playerIds
                  });
                  ElMessage.success(result.message || '赛季-队伍-选手关联添加成功');
                  // 重新加载所有基础数据，确保选手信息完整
                  await store.dispatch('loadBaseData');
                  // 重新加载赛季-队伍关联数据
                  await loadSeasonTeamsForPlayers();
                  // 重新加载赛季-队伍-选手关联数据
                  await loadSeasonTeamPlayers();
                }
                break;
            }
            dialogVisible.value = false;
          } catch (error) {
            ElMessage.error('操作失败: ' + error.message);
          }
        } else {
          ElMessage.warning('请检查表单数据');
        }
      });
    };
    

    
    // 删除赛季
    const deleteSeason = async (id) => {
      try {
        await ElMessageBox.confirm('确定要删除这个赛季吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await store.dispatch('deleteSeason', id);
        ElMessage.success('赛季删除成功');
        // 重新加载赛季数据
        await store.dispatch('loadBaseData');
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + error.message);
        }
      }
    };
    
    // 删除队伍
    const deleteTeam = async (id) => {
      try {
        await ElMessageBox.confirm('确定要删除这个队伍吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await store.dispatch('deleteTeam', id);
        ElMessage.success('队伍删除成功');
        // 重新加载队伍数据
        await store.dispatch('loadBaseData');
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + error.message);
        }
      }
    };
    
    // 删除选手
    const deletePlayer = async (id) => {
      try {
        await ElMessageBox.confirm('确定要删除这个选手吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await store.dispatch('deletePlayer', id);
        ElMessage.success('选手删除成功');
        // 重新加载选手数据
        await store.dispatch('loadBaseData');
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + error.message);
        }
      }
    };
    
    // 删除赛季-队伍关联
    const deleteSeasonTeam = async (id) => {
      try {
        await ElMessageBox.confirm('确定要删除这个赛季-队伍关联吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await store.dispatch('deleteSeasonTeam', id);
        ElMessage.success('赛季-队伍关联删除成功');
        loadSeasonTeams();
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + error.message);
        }
      }
    };
    
    // 删除赛季-队伍-选手关联
    const deleteSeasonTeamPlayer = async (id) => {
      try {
        await ElMessageBox.confirm('确定要删除这个赛季-队伍-选手关联吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await store.dispatch('deleteSeasonTeamPlayer', id);
        ElMessage.success('赛季-队伍-选手关联删除成功');
        loadSeasonTeamPlayers();
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + error.message);
        }
      }
    };
    

    
    // 组件挂载时加载数据
    onMounted(async () => {
      await store.dispatch('loadBaseData');
      loadMatches();
      loadChartConfig();
      
      window.addEventListener('resize', updateIsMobile);
    });
    
    return {
      activeTab,
      filterForm,
      seasonTeamFilter,
      seasonTeamPlayerFilter,
      matches,
      loading,
      total,
      currentPage,
      pageSize,
      dialogVisible,
      dialogTitle,
      dialogType,
      editForm,
      editFormRef,
      seasonRules,
      teamRules,
      playerRules,
      seasonTeamRules,
      seasonTeamPlayerRules,
      seasons,
      teams,
      players,
      seasonTeams,
      seasonTeamPlayers,
      availableTeams,
      availablePlayers,
      isPlayerAlreadyInSeason,
      maps,
      heroes,
      mapGameEditDialogVisible,
      mapGameEditTab,
      currentMatchForEdit,
      mapGamesForEdit,
      mapGameSaving,
      getSeasonName,
      getTeamName,
      getPlayerName,
      getRoleText,
      getRoleType,
      getMapName,
      getHeroName,
      formatDate,
      searchMatches,
      resetFilter,
      handleSizeChange,
      handleCurrentChange,
      handleTabClick,
      editMapGames,
      deleteMapGame,
      addSeason,
      editSeason,
      addTeam,
      editTeam,
      addPlayer,
      editPlayer,
      addSeasonTeam,
      addSeasonTeamPlayer,
      saveEdit,
      saveMapGameEdit,
      resetMapGameEditForm,
      deleteSeason,
      deleteTeam,
      deletePlayer,
      deleteSeasonTeam,
      deleteSeasonTeamPlayer,
      loadSeasonTeams,
      loadSeasonTeamPlayers,
      loadSeasonTeamsForPlayers,
      handleSeasonChangeForTeams,
      handleSeasonTeamChangeForPlayers,
      getRoleCount,
      getRoleSlots,
      getPlayersByRole,
      getHeroesByRole,
      getMatchTeamPlayers,
      getMapGamePlayerStat,
      handleMapGamePlayerChange,
      chartConfig,
      saveChartConfig,
      isMobile,
      actionColWidth,
      deleteActionColWidth,
      importDialogVisible,
      showImportDialog,
      handleImportSuccess
    };
  }
};
</script>

<style scoped>
.chart-config-form {
  padding: 20px;
}

.config-section-title {
  margin: 20px 0 15px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  border-left: 4px solid #409eff;
  padding-left: 10px;
}

.config-section-title:first-child {
  margin-top: 0;
}

.data-manage-container {
  padding: 20px 0;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 30px;
  color: #333;
}

.nav-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

.filter-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

.data-card {
  border-radius: 8px;
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.match-up {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.match-up .winner {
  color: #67c23a;
  font-weight: 500;
}

.vs {
  font-size: 12px;
  color: #999;
  margin: 0 8px;
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  color: #999;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 标签页样式 */
.el-tabs {
  width: 100%;
}

.action-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.action-buttons .el-button {
  margin: 0 4px;
}

.el-tabs__content {
  margin-top: 15px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .el-form {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  
  .el-form-item {
    margin-bottom: 15px;
  }
  
  .match-up {
    flex-direction: column;
    gap: 8px;
  }
  
  .vs {
    margin: 4px 0;
  }
  
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .el-tabs__nav {
    flex-wrap: wrap;
  }
  
  .el-tabs__item {
    margin-bottom: 10px;
  }
  
  .pagination-container {
    justify-content: center;
  }
  
  .filter-card {
    margin-bottom: 15px;
  }
  
  .data-card {
    margin-bottom: 15px;
  }
  
  .dialog-footer {
    flex-direction: row;
    justify-content: flex-end;
    gap: 10px;
  }
  
  .dialog-footer .el-button {
    width: auto;
    margin-left: 0;
  }
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

.player-info {
  margin-bottom: 15px;
}

.player-label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: #606266;
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

/* 平板设备响应式设计 */
@media (min-width: 769px) and (max-width: 1024px) {
  .el-form {
    flex-wrap: wrap;
  }
  
  .el-form-item {
    margin-right: 15px;
    margin-bottom: 15px;
  }
  
  .card-header {
    flex-direction: row;
    align-items: center;
    gap: 15px;
  }
  
  .pagination-container {
    justify-content: flex-end;
  }
}
</style>