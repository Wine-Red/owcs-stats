<template>
  <div class="data-manage-container">
    <h2 class="page-title">数据管理 - {{ pageTitleMap[activeTab] || '概览' }}</h2>

    <!-- 图表管理 -->
    <div v-show="activeTab === 'charts'">
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>图表显示配置</span>
            <el-button type="primary" @click="saveChartConfig">保存配置</el-button>
          </div>
        </template>
        <el-form :model="chartConfig" label-width="120px" class="chart-config-form">
           <h3 class="config-section-title">全局数据统计</h3>
           <el-form-item label="赛事概览">
             <el-switch v-model="chartConfig.overviewTab" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
           <el-form-item label="近期比赛">
             <el-switch v-model="chartConfig.recentTab" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
           <el-form-item label="赛事数据">
             <el-switch v-model="chartConfig.statsTab" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
           <el-form-item label="英雄禁用统计">
             <el-switch v-model="chartConfig.heroBan" active-text="显示" inactive-text="隐藏" />
           </el-form-item>

           <h3 class="config-section-title">详细数据统计</h3>
           <el-form-item label="队伍数据">
             <el-switch v-model="chartConfig.teamStats" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
           <el-form-item label="选手数据">
             <el-switch v-model="chartConfig.playerStats" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
           <el-form-item label="选手雷达图">
             <el-switch v-model="chartConfig.playerRadar" active-text="显示" inactive-text="隐藏" />
           </el-form-item>
        </el-form>
      </el-card>
    </div>

    <div v-show="activeTab === 'season-visualize'">
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>赛季可视化配置</span>
            <el-button type="primary" @click="saveSeasonVisualConfig" :disabled="!seasonVisualForm.seasonId">保存配置</el-button>
          </div>
        </template>
        <el-form :model="seasonVisualForm" label-width="140px">
          <el-form-item label="赛季">
            <el-select v-model="seasonVisualForm.seasonId" placeholder="请选择赛季" style="width: 280px" @change="loadSeasonVisualConfig">
              <el-option
                v-for="season in seasons"
                :key="season.id"
                :label="season.name"
                :value="season.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="标签">
            <el-select v-model="seasonVisualForm.tags" multiple filterable allow-create default-first-option style="width: 100%" placeholder="输入后回车新增标签">
              <el-option v-for="tag in seasonVisualForm.tags" :key="tag" :label="tag" :value="tag" />
            </el-select>
          </el-form-item>
          <el-form-item label="比赛日期">
            <el-input v-model="seasonVisualForm.dateRange" placeholder="如：2026.03.05 - 2026.04.12" style="width: 100%" />
          </el-form-item>
          <el-form-item label="地图池">
            <el-select v-model="seasonVisualForm.mapIds" multiple filterable style="width: 100%" placeholder="选择该赛季地图池">
              <el-option
                v-for="map in maps"
                :key="map.id"
                :label="map.name"
                :value="map.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="积分榜模板">
            <el-select v-model="seasonVisualForm.standingsTemplate" placeholder="请选择模板" style="width: 240px">
              <el-option label="W-L / Maps / +/-" value="wl_maps" />
              <el-option label="Points(3-0)" value="points_3_0" />
            </el-select>
          </el-form-item>
          <el-form-item label="当前阶段名称">
            <el-input v-model="seasonVisualForm.currentStageLabel" placeholder="例如：季后赛" style="max-width: 240px" />
          </el-form-item>

          <el-divider content-position="left">阶段积分榜覆盖</el-divider>

          <div v-if="stageSegments.length > 0" class="stage-overrides">
            <div v-for="seg in stageSegments" :key="seg.key" class="stage-override-card">
              <div class="stage-override-title">
                <span>{{ seg.label }}</span>
                <span class="stage-override-key">{{ seg.key }}</span>
              </div>

              <el-form-item label="隐藏队伍">
                <el-select
                  v-model="getStageOverride(seg.key).hiddenTeamIds"
                  multiple
                  filterable
                  collapse-tags
                  collapse-tags-tooltip
                  style="width: 100%"
                  placeholder="选择需要隐藏的队伍（淘汰队伍可隐藏）"
                >
                  <el-option
                    v-for="team in seasonVisualTeams"
                    :key="'hide-' + team.id"
                    :label="team.name"
                    :value="team.id"
                  />
                </el-select>
              </el-form-item>

              <el-form-item label="手动排序队伍">
                <el-select
                  :model-value="getStageOverride(seg.key).orderedTeamIds"
                  multiple
                  filterable
                  collapse-tags
                  collapse-tags-tooltip
                  style="width: 100%"
                  placeholder="选择需要手动排序的队伍（未选择的队伍仍按默认排序）"
                  @update:modelValue="val => handleOrderedTeamIdsChange(seg.key, val)"
                >
                  <el-option
                    v-for="team in seasonVisualTeams"
                    :key="'order-' + team.id"
                    :label="team.name"
                    :value="team.id"
                  />
                </el-select>

                <div class="ordered-list" v-if="getStageOverride(seg.key).orderedTeamIds.length > 0">
                  <div
                    v-for="(teamId, idx) in getStageOverride(seg.key).orderedTeamIds"
                    :key="seg.key + '-row-' + teamId"
                    class="ordered-row"
                  >
                    <div class="ordered-row-left">
                      <span class="ordered-index">{{ idx + 1 }}</span>
                      <span class="ordered-name">{{ getTeamName(teamId) }}</span>
                    </div>
                    <div class="ordered-row-actions">
                      <el-button size="small" @click="moveOrderedTeam(seg.key, idx, -1)" :disabled="idx === 0">上移</el-button>
                      <el-button size="small" @click="moveOrderedTeam(seg.key, idx, 1)" :disabled="idx === getStageOverride(seg.key).orderedTeamIds.length - 1">下移</el-button>
                      <el-button size="small" type="danger" @click="removeOrderedTeam(seg.key, teamId)">移除</el-button>
                    </div>
                  </div>
                </div>
              </el-form-item>
            </div>
          </div>
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
              v-for="team in matchFilterTeams"
              :key="team.id"
              :label="team.name"
              :value="team.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="比赛日期">
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

      <!-- 比赛列表 -->
      <el-card class="data-card list-card" style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>比赛列表</span>
            <div class="header-actions">
              <el-button v-if="!exportMode" type="primary" plain @click="toggleExportMode">
                <el-icon><Download /></el-icon> 选择比赛导出
              </el-button>
              <div v-else class="export-mode-controls">
                <span class="selected-count">已选 {{ selectedMatchIds.length }} 场</span>
                <el-button type="primary" :disabled="selectedMatchIds.length === 0" @click="exportSelectedMatches" :loading="isExporting">
                  确认导出
                </el-button>
                <el-button @click="toggleExportMode">取消</el-button>
              </div>
              <el-button type="primary" @click="syncExternalMatches" :loading="syncing">
                <el-icon><Refresh /></el-icon>
                从API同步
              </el-button>
              <el-button type="success" @click="showImportDialog">
                <el-icon><Upload /></el-icon>
                导入地图数据
              </el-button>
            </div>
          </div>
        </template>
        <el-table
          v-loading="loading"
          :data="matches"
          style="width: 100%"
          border
          @selection-change="handleSelectionChange"
        >
          <el-table-column v-if="exportMode" type="selection" width="55" />
          <el-table-column label="比赛日期" width="120">
            <template #default="scope">
              {{ scope.row.matchDate }}
            </template>
          </el-table-column>
          <el-table-column label="赛季" width="180">
            <template #default="scope">
              {{ getSeasonName(scope.row.seasonId) }}
            </template>
          </el-table-column>
          <el-table-column label="对阵" width="300">
            <template #default="scope">
              <div class="match-up">
                <span :class="{'winner': scope.row.winnerId === scope.row.team1Id}">{{ getTeamName(scope.row.team1Id) }}</span>
                <span class="score" v-if="scope.row.team1Score !== null && scope.row.team2Score !== null">
                  {{ scope.row.team1Score }} - {{ scope.row.team2Score }}
                </span>
                <span class="vs" v-else>VS</span>
                <span :class="{'winner': scope.row.winnerId === scope.row.team2Id}">{{ getTeamName(scope.row.team2Id) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="赛制" width="100">
            <template #default="scope">
              {{ scope.row.boFormat || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" :width="actionColWidth" fixed="right">
            <template #default="scope">
              <div class="action-buttons">
                <el-button type="warning" size="small" @click="editMapGames(scope.row)">
                  <el-icon><Edit /></el-icon>
                  <span v-if="!isMobile">编辑比赛</span>
                </el-button>
                <el-button type="danger" size="small" @click="deleteMatch(scope.row.id)">
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
          <p>暂无比赛数据</p>
        </div>
      </el-card>
    </div>

    <!-- 赛季数据导入 -->
    <div v-show="activeTab === 'season-stats-upload'">
      <SeasonStatsUpload />
    </div>

    <!-- 赛季管理 -->
    <div v-show="activeTab === 'seasons'">
      <el-card class="data-card list-card">
        <template #header>
          <div class="card-header">
            <span>赛季列表</span>
            <el-button type="primary" @click="addSeason">
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
          <el-table-column prop="externalEventName" label="外部事件关联名" width="200" />
          <el-table-column prop="stage" label="所属赛段" width="150" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.status === 'in_progress' ? 'success' : 'info'">
                {{ scope.row.status === 'in_progress' ? '进行中' : '已完成' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" :width="actionColWidth" fixed="right" align="center">
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
      <el-card class="data-card list-card">
        <template #header>
          <div class="card-header">
            <span>队伍列表</span>
            <el-button type="primary" @click="addTeam">
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
          <el-table-column prop="name" label="队伍名称" min-width="200" />
          <el-table-column label="操作" :width="actionColWidth" fixed="right" align="center">
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
      <el-row :gutter="24">
        <el-col :xs="24" :sm="12" :md="8" v-for="role in ['tank', 'damage', 'support']" :key="role">
          <el-card class="data-card role-card list-card">
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
              <el-table-column prop="name" label="选手名称" min-width="120" />
              <el-table-column label="操作" :width="actionColWidth" fixed="right" align="center">
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
            <el-button type="primary" @click="addSeasonTeam">
              <el-icon><Plus /></el-icon>
              添加赛季-队伍关联
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
      <el-card class="data-card list-card" style="margin-top: 20px">
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
            <el-button type="primary" @click="addSeasonTeamPlayer">
              <el-icon><Plus /></el-icon>
              添加赛季-队伍-选手关联
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
      <el-card class="data-card list-card" style="margin-top: 20px">
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
          <el-form-item label="外部事件关联名" prop="externalEventName">
            <el-input v-model="editForm.externalEventName" placeholder="请输入外部API事件名称（如：OWCSCNS1）" style="width: 100%" />
          </el-form-item>
          <el-form-item label="所属赛段" prop="stage">
            <el-input v-model="editForm.stage" placeholder="请输入所属赛段（如：2024 亚洲赛区）" style="width: 100%" />
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
              <el-option label="重装" value="tank" />
              <el-option label="输出" value="damage" />
              <el-option label="支援" value="support" />
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

    <!-- 编辑比赛对话框 -->
    <el-dialog
      v-model="mapGameEditDialogVisible"
      title="编辑比赛及地图局"
      width="90%"
      destroy-on-close
      @close="resetMapGameEditForm"
    >
      <div v-if="currentMatchForEdit">
        <!-- 比赛信息编辑 -->
        <el-card shadow="never" style="margin-bottom: 20px;">
          <template #header>
            <div class="card-header">
              <span>比赛基础信息</span>
            </div>
          </template>
          <el-form :model="currentMatchForEdit" label-width="120px" :inline="false">
            <el-row :gutter="20">
              <el-col :span="8">
                <el-form-item label="队伍1 (左侧)">
                  <el-select v-model="currentMatchForEdit.team1Id" placeholder="选择队伍" style="width: 100%">
                    <el-option v-for="team in matchEditTeams" :key="team.id" :label="team.name" :value="team.id" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="队伍2 (右侧)">
                  <el-select v-model="currentMatchForEdit.team2Id" placeholder="选择队伍" style="width: 100%">
                    <el-option v-for="team in matchEditTeams" :key="team.id" :label="team.name" :value="team.id" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="大场获胜方">
                  <el-select v-model="currentMatchForEdit.winnerId" placeholder="选择获胜队伍" style="width: 100%">
                    <el-option :label="getTeamName(currentMatchForEdit.team1Id)" :value="currentMatchForEdit.team1Id" />
                    <el-option :label="getTeamName(currentMatchForEdit.team2Id)" :value="currentMatchForEdit.team2Id" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="8">
                <el-form-item label="队伍1得分">
                  <el-input-number v-model="currentMatchForEdit.team1Score" :min="0" :max="10" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="队伍2得分">
                  <el-input-number v-model="currentMatchForEdit.team2Score" :min="0" :max="10" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="赛制">
                  <el-select v-model="currentMatchForEdit.boFormat" placeholder="如: BO5" style="width: 100%">
                    <el-option label="BO3" value="BO3" />
                    <el-option label="BO5" value="BO5" />
                    <el-option label="BO7" value="BO7" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>

        <!-- 地图局列表编辑 -->
        <div v-if="mapGameEditLoading && mapGamesForEdit.length === 0" class="map-game-loading">
          正在加载地图小局...
        </div>
        <div v-if="mapGamesForEdit.length > 0">
          <el-tabs v-model="mapGameEditTab" type="border-card">
            <el-tab-pane
              v-for="(mapGame, index) in mapGamesForEdit"
              :key="mapGame.id"
              :label="getMapName(mapGame.mapId) || `地图 ${index + 1}`"
              :name="mapGame.id.toString()"
            >
              <div v-if="mapGame.isLoading" class="map-game-loading">
                正在加载 {{ getMapName(mapGame.mapId) || `地图 ${index + 1}` }} 的详细数据...
              </div>
              <template v-else>
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
                <el-row :gutter="20">
                  <el-col :span="8">
                    <el-form-item label="队伍1得分">
                      <el-input-number v-model="mapGame.team1Score" :min="0" :max="10" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="队伍2得分">
                      <el-input-number v-model="mapGame.team2Score" :min="0" :max="10" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="录像代码">
                      <el-input v-model="mapGame.replayId" placeholder="回放代码" />
                    </el-form-item>
                  </el-col>
                </el-row>
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
                    :min="0.1"
                    :max="120"
                    :step="0.01"
                    :precision="2"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-form>

              <div class="player-stats-container">
                <el-row :gutter="20">
                  <!-- 队伍1 选手 -->
                  <el-col :span="12">
                    <div class="team-panel team-a-panel">
                      <h3 class="team-panel-title a-title">{{ getTeamName(currentMatchForEdit.team1Id) }} 选手</h3>
                      
                      <div class="player-stats-header">
                        <div class="col-name">名称</div>
                        <div class="col-role">职责</div>
                        <div class="col-kad">K/A/D</div>
                        <div class="col-dmg">伤害</div>
                        <div class="col-heal">治疗</div>
                        <div class="col-mit">抵挡</div>
                        <div class="col-action"></div>
                      </div>

                      <div class="player-stat-row" v-for="(stat, idx) in mapGame.team1Stats" :key="'t1-'+idx">
                        <div class="col-name">
                          <el-select v-model="stat.playerId" placeholder="选择选手" filterable @change="handlePlayerChange(stat)">
                            <el-option
                              v-for="player in getMatchTeamPlayers(mapGame, 'team1', stat.role)"
                              :key="player.id"
                              :label="player.name"
                              :value="player.id"
                            >
                              <span style="float: left">{{ player.name }}</span>
                              <span style="float: right; color: var(--el-text-color-secondary); font-size: 13px;">{{ getRoleText(player.role) }}</span>
                            </el-option>
                          </el-select>
                        </div>
                        <div class="col-role">
                          <el-select v-model="stat.role" @change="stat.playerId = ''">
                            <el-option label="T" value="tank" />
                            <el-option label="D" value="damage" />
                            <el-option label="S" value="support" />
                          </el-select>
                        </div>
                        <div class="col-kad">
                          <el-input v-model="stat.kad" placeholder="0/0/0" />
                        </div>
                        <div class="col-dmg">
                          <el-input-number v-model="stat.damage" :min="0" :controls="false" />
                        </div>
                        <div class="col-heal">
                          <el-input-number v-model="stat.healing" :min="0" :controls="false" />
                        </div>
                        <div class="col-mit">
                          <el-input-number v-model="stat.mitigation" :min="0" :controls="false" />
                        </div>
                        <div class="col-action">
                          <el-button type="danger" icon="Delete" circle size="small" @click="clearStatRow(stat)" />
                        </div>
                      </div>
                      
                      <el-button type="primary" plain size="small" @click="addStatRow(mapGame.team1Stats, currentMatchForEdit.team1Id)" style="margin-top: 10px; width: 100%">+ 添加选手</el-button>
                    </div>
                  </el-col>

                  <!-- 队伍2 选手 -->
                  <el-col :span="12">
                    <div class="team-panel team-b-panel">
                      <h3 class="team-panel-title b-title">{{ getTeamName(currentMatchForEdit.team2Id) }} 选手</h3>
                      
                      <div class="player-stats-header">
                        <div class="col-name">名称</div>
                        <div class="col-role">职责</div>
                        <div class="col-kad">K/A/D</div>
                        <div class="col-dmg">伤害</div>
                        <div class="col-heal">治疗</div>
                        <div class="col-mit">抵挡</div>
                        <div class="col-action"></div>
                      </div>

                      <div class="player-stat-row" v-for="(stat, idx) in mapGame.team2Stats" :key="'t2-'+idx">
                        <div class="col-name">
                          <el-select v-model="stat.playerId" placeholder="选择选手" filterable @change="handlePlayerChange(stat)">
                            <el-option
                              v-for="player in getMatchTeamPlayers(mapGame, 'team2', stat.role)"
                              :key="player.id"
                              :label="player.name"
                              :value="player.id"
                            >
                              <span style="float: left">{{ player.name }}</span>
                              <span style="float: right; color: var(--el-text-color-secondary); font-size: 13px;">{{ getRoleText(player.role) }}</span>
                            </el-option>
                          </el-select>
                        </div>
                        <div class="col-role">
                          <el-select v-model="stat.role" @change="stat.playerId = ''">
                            <el-option label="T" value="tank" />
                            <el-option label="D" value="damage" />
                            <el-option label="S" value="support" />
                          </el-select>
                        </div>
                        <div class="col-kad">
                          <el-input v-model="stat.kad" placeholder="0/0/0" />
                        </div>
                        <div class="col-dmg">
                          <el-input-number v-model="stat.damage" :min="0" :controls="false" />
                        </div>
                        <div class="col-heal">
                          <el-input-number v-model="stat.healing" :min="0" :controls="false" />
                        </div>
                        <div class="col-mit">
                          <el-input-number v-model="stat.mitigation" :min="0" :controls="false" />
                        </div>
                        <div class="col-action">
                          <el-button type="danger" icon="Delete" circle size="small" @click="clearStatRow(stat)" />
                        </div>
                      </div>
                      
                      <el-button type="primary" plain size="small" @click="addStatRow(mapGame.team2Stats, currentMatchForEdit.team2Id)" style="margin-top: 10px; width: 100%">+ 添加选手</el-button>
                    </div>
                  </el-col>
                </el-row>
              </div>
              </template>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="mapGameEditDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveMapGameEdit" :loading="mapGameSaving" :disabled="isMapGameEditBusy">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { 
  Search, Refresh, Edit, Delete, Plus, Upload, Download
} from '@element-plus/icons-vue';
import apiService from '../../services/api';
import MapDataImport from './components/MapDataImport.vue';
import SeasonStatsUpload from './components/SeasonStatsUpload.vue';

export default {
  name: 'DataManage',
  components: {
    Search,
    Refresh,
    Edit,
    Delete,
    Plus,
    Upload,
    Download,
    MapDataImport,
    SeasonStatsUpload
  },
  setup() {
    // 页面标题映射
    const pageTitleMap = {
      'season-stats-upload': '赛季数据导入',
      'seasons': '赛季管理',
      'season-visualize': '赛季可视化配置',
      'teams': '队伍管理',
      'players': '选手管理',
      'season-teams': '赛季-队伍关联',
      'season-team-players': '赛季-队伍-选手关联',
      'charts': '图表管理',
      'matches': '比赛管理'
    };

    const store = useStore();
    
    // 响应式布局
    const isMobile = ref(window.innerWidth < 768);
    const updateIsMobile = () => {
      isMobile.value = window.innerWidth < 768;
    };

    // 操作栏宽度
    const actionColWidth = computed(() => isMobile.value ? 100 : 180);
    const deleteActionColWidth = computed(() => isMobile.value ? 70 : 100);
    
    // 监听路由参数来决定激活的 tab
    const route = useRoute();
    const router = useRouter();
    const activeTab = ref(route.path.split('/').pop() || 'season-stats-upload');
    
    watch(() => route.path, (newPath) => {
      const tabName = newPath.split('/').pop();
      if (tabName && activeTab.value !== tabName && pageTitleMap[tabName]) {
        activeTab.value = tabName;
        handleTabClick();
      }
    });

    // 处理标签页切换
    const handleTabClick = () => {
      // 当通过 tabs 切换时，更新 URL 以保持一致
      const currentPathTab = route.path.split('/').pop();
      if (currentPathTab !== activeTab.value) {
        router.push(`/data-manage/${activeTab.value}`);
      }

      // 切换标签页时的处理逻辑
      if (activeTab.value === 'season-teams') {
        loadSeasonTeams();
      } else if (activeTab.value === 'season-team-players') {
        loadSeasonTeamsForPlayers();
      } else if (activeTab.value === 'charts') {
        loadChartConfig();
      } else if (activeTab.value === 'season-visualize') {
        if (seasonVisualForm.value.seasonId) {
          loadSeasonVisualConfig(seasonVisualForm.value.seasonId);
        }
      }
    };
    
    // API 同步状态
    const syncing = ref(false);
    
    // 从外部 API 同步比赛数据
    const syncExternalMatches = async () => {
      try {
        syncing.value = true;
        const response = await apiService.syncExternalMatches();
        const data = response.data || response;
        const summaryText = [
          `新增比赛: ${data.newMatchesCount || 0}`,
          `更新比赛: ${data.updatedMatchesCount || 0}`,
          `新增地图局: ${data.newMapGamesCount || 0}`,
          `更新地图局: ${data.updatedMapGamesCount || 0}`,
          `新增选手数据: ${data.newPlayerStatsCount || 0}`,
          `更新选手数据: ${data.updatedPlayerStatsCount || 0}`
        ].join('，');
        
        if (data.errors && data.errors.length > 0) {
          ElMessage.warning(`同步结束。${summaryText}。但有 ${data.errors.length} 场失败（请看控制台日志）。`);
          console.warn('同步失败的比赛详情:', data.errors);
        } else {
          ElMessage.success(`同步完成！${summaryText}`);
        }
      } catch (error) {
        ElMessage.error('同步失败: ' + (error.response?.data?.error || error.message));
      } finally {
        syncing.value = false;
      }
    };

    // Export State
    const exportMode = ref(false);
    const selectedMatchIds = ref([]);
    const isExporting = ref(false);

    const toggleExportMode = () => {
      exportMode.value = !exportMode.value;
      if (!exportMode.value) {
        selectedMatchIds.value = [];
      }
    };

    const handleSelectionChange = (selection) => {
      selectedMatchIds.value = selection.map(item => item.id);
    };

    const exportSelectedMatches = async () => {
      if (selectedMatchIds.value.length === 0) return;
      isExporting.value = true;
      try {
        const response = await apiService.exportMatches(selectedMatchIds.value);
        const blob = new Blob([response], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `matches_export_${new Date().getTime()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        ElMessage.success('导出成功');
        toggleExportMode();
      } catch (err) {
        console.error('Failed to export matches:', err);
        ElMessage.error('导出失败');
      } finally {
        isExporting.value = false;
      }
    };
    
    // 筛选表单
    const filterForm = ref({
      seasonId: '',
      teamId: '',
      dateRange: []
    });
    const matchFilterTeams = ref([]);
    const matchEditTeams = ref([]);
    
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
      overviewTab: true,
      recentTab: true,
      statsTab: true,
      heroBan: true,
      teamStats: true,
      playerStats: true,
      playerRadar: true
    });

    // 加载图表配置
    const loadChartConfig = async () => {
      try {
        const config = await apiService.getConfig('visualize_chart_config');
        if (config) {
          chartConfig.value = { ...chartConfig.value, ...config };
        }
      } catch (error) {
        console.error('加载图表配置失败:', error);
        // 如果后端没有配置，尝试从本地加载（兼容旧数据）
        const saved = localStorage.getItem('visualize_chart_config');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            chartConfig.value = { ...chartConfig.value, ...parsed };
          } catch (e) { /* ignore */ }
        }
      }
    };

    // 保存图表配置
    const saveChartConfig = async () => {
      try {
        await apiService.updateConfig({
          key: 'visualize_chart_config',
          value: chartConfig.value,
          description: '可视化图表显示配置'
        });
        localStorage.setItem('visualize_chart_config', JSON.stringify(chartConfig.value)); // 双重备份
        ElMessage.success('图表配置已保存');
      } catch (error) {
        console.error('保存图表配置失败:', error);
        ElMessage.error('保存配置失败');
      }
    };

    const seasonVisualForm = ref({
      seasonId: '',
      tags: [],
      dateRange: '',
      mapIds: [],
      standingsTemplate: 'wl_maps',
      currentStageLabel: '当前阶段',
      stageOverrides: {}
    });

    const buildSeasonVisualKey = (seasonId) => `visualize_season_${seasonId}`;

    const normalizeStringArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(v => String(v).trim()).filter(Boolean);
    };

    const normalizeIdArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(v => Number(v)).filter(v => Number.isFinite(v));
    };

    const stageSnapshots = ref([]);

    const buildStageSegments = (snapshotList, currentStageLabel) => {
      const list = Array.isArray(snapshotList) ? snapshotList : [];
      const segments = [];
      for (let i = 0; i < list.length; i++) {
        const to = list[i];
        const from = i > 0 ? list[i - 1] : null;
        segments.push({
          key: `snap:${from ? from.id : 0}->${to.id}`,
          label: String(to.name || `阶段${i + 1}`),
          fromSnapshotId: from ? from.id : null,
          toSnapshotId: to.id
        });
      }
      if (list.length > 0) {
        const last = list[list.length - 1];
        segments.push({
          key: `snap:${last.id}->current`,
          label: String(currentStageLabel || '当前阶段'),
          fromSnapshotId: last.id,
          toSnapshotId: null
        });
      }
      return segments;
    };

    const stageSegments = computed(() => buildStageSegments(stageSnapshots.value, seasonVisualForm.value.currentStageLabel));

    const loadStageSnapshots = async (seasonId) => {
      if (!seasonId) {
        stageSnapshots.value = [];
        return;
      }
      try {
        const res = await apiService.getSeasonStageSnapshots(seasonId);
        stageSnapshots.value = Array.isArray(res) ? res : res?.data || [];
      } catch (e) {
        stageSnapshots.value = [];
      }
    };

    const loadSeasonTeamsForVisualConfig = async (seasonId) => {
      if (!seasonId) return;
      try {
        const allSeasonTeams = await apiService.getAllSeasonTeams();
        const seasonIdNum = Number(seasonId);
        const filtered = (allSeasonTeams || []).filter(st => Number(st.seasonId) === seasonIdNum);
        store.commit('setSeasonTeams', filtered);
      } catch (e) {
        store.commit('setSeasonTeams', []);
      }
    };

    const getStageOverride = (segmentKey) => {
      if (!seasonVisualForm.value.stageOverrides || typeof seasonVisualForm.value.stageOverrides !== 'object') {
        seasonVisualForm.value.stageOverrides = {};
      }
      if (!seasonVisualForm.value.stageOverrides[segmentKey]) {
        seasonVisualForm.value.stageOverrides[segmentKey] = { orderedTeamIds: [], hiddenTeamIds: [] };
      }
      const current = seasonVisualForm.value.stageOverrides[segmentKey];
      if (!Array.isArray(current.orderedTeamIds)) current.orderedTeamIds = [];
      if (!Array.isArray(current.hiddenTeamIds)) current.hiddenTeamIds = [];
      return current;
    };

    const handleOrderedTeamIdsChange = (segmentKey, selectedIds) => {
      const next = (Array.isArray(selectedIds) ? selectedIds : []).map(v => Number(v)).filter(v => Number.isFinite(v));
      const override = getStageOverride(segmentKey);
      const prev = override.orderedTeamIds.map(v => Number(v)).filter(v => Number.isFinite(v));
      const kept = prev.filter(id => next.includes(id));
      const appended = next.filter(id => !kept.includes(id));
      override.orderedTeamIds = kept.concat(appended);
    };

    const moveOrderedTeam = (segmentKey, index, delta) => {
      const override = getStageOverride(segmentKey);
      const list = override.orderedTeamIds;
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= list.length) return;
      const copy = list.slice();
      const tmp = copy[index];
      copy[index] = copy[nextIndex];
      copy[nextIndex] = tmp;
      override.orderedTeamIds = copy;
    };

    const removeOrderedTeam = (segmentKey, teamId) => {
      const override = getStageOverride(segmentKey);
      const id = Number(teamId);
      override.orderedTeamIds = override.orderedTeamIds.filter(v => Number(v) !== id);
    };

    const seasonVisualTeams = computed(() => {
      const seasonIdNum = Number(seasonVisualForm.value.seasonId);
      if (!Number.isFinite(seasonIdNum)) return [];
      const ids = (seasonTeams.value || [])
        .filter(st => Number(st.seasonId) === seasonIdNum)
        .map(st => Number(st.teamId))
        .filter(v => Number.isFinite(v));
      const uniqueIds = Array.from(new Set(ids));
      const list = (teams.value || []).filter(t => uniqueIds.includes(Number(t.id)));
      return list;
    });

    const loadSeasonVisualConfig = async (seasonId) => {
      const id = seasonId || seasonVisualForm.value.seasonId;
      if (!id) return;
      try {
        const config = await apiService.getConfig(buildSeasonVisualKey(id));
        const tags = normalizeStringArray(config?.tags);
        const dateRange = config?.dateRange || '';
        const mapIds = normalizeIdArray(config?.mapPool?.mapIds);
        const standingsTemplate = config?.standings?.template === 'points_3_0' ? 'points_3_0' : 'wl_maps';
        const stageOverrides = (config?.standings?.stageOverrides && typeof config.standings.stageOverrides === 'object')
          ? config.standings.stageOverrides
          : {};
        const currentStageLabel = String(config?.standings?.currentStageLabel || '当前阶段');

        seasonVisualForm.value.tags = tags;
        seasonVisualForm.value.dateRange = dateRange;
        seasonVisualForm.value.mapIds = mapIds;
        seasonVisualForm.value.standingsTemplate = standingsTemplate;
        seasonVisualForm.value.currentStageLabel = currentStageLabel;
        seasonVisualForm.value.stageOverrides = stageOverrides;
        await loadStageSnapshots(id);
        await loadSeasonTeamsForVisualConfig(id);
      } catch (error) {
        seasonVisualForm.value.tags = [];
        seasonVisualForm.value.dateRange = '';
        seasonVisualForm.value.mapIds = [];
        seasonVisualForm.value.standingsTemplate = 'wl_maps';
        seasonVisualForm.value.currentStageLabel = '当前阶段';
        seasonVisualForm.value.stageOverrides = {};
        await loadStageSnapshots(id);
        await loadSeasonTeamsForVisualConfig(id);
      }
    };

    const saveSeasonVisualConfig = async () => {
      if (!seasonVisualForm.value.seasonId) return;
      try {
        const value = {
          tags: normalizeStringArray(seasonVisualForm.value.tags),
          dateRange: seasonVisualForm.value.dateRange,
          mapPool: { mapIds: normalizeIdArray(seasonVisualForm.value.mapIds) },
          standings: {
            template: seasonVisualForm.value.standingsTemplate === 'points_3_0' ? 'points_3_0' : 'wl_maps',
            currentStageLabel: String(seasonVisualForm.value.currentStageLabel || '当前阶段'),
            stageOverrides: (seasonVisualForm.value.stageOverrides && typeof seasonVisualForm.value.stageOverrides === 'object') ? seasonVisualForm.value.stageOverrides : {}
          }
        };
        await apiService.updateConfig({
          key: buildSeasonVisualKey(seasonVisualForm.value.seasonId),
          value,
          description: '赛季可视化配置（标签/地图池/积分榜模板）'
        });
        ElMessage.success('赛季可视化配置已保存');
      } catch (error) {
        console.error('保存赛季可视化配置失败:', error);
        ElMessage.error('保存配置失败');
      }
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
    const mapGameEditLoading = ref(false);
    const mapGameSaving = ref(false);
    let latestMapGameEditRequestId = 0;
    
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
        tank: '重装',
        damage: '输出',
        support: '支援'
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

    const buildTeamStats = (stats, teamId) => {
      const teamStats = (Array.isArray(stats) ? stats : [])
        .filter(stat => stat.teamId === teamId)
        .map((stat) => {
          const player = stat.player || players.value.find(p => p.id === stat.playerId);
          return {
            ...stat,
            role: player ? (player.role === 'tank' ? 'tank' : player.role === 'damage' ? 'damage' : 'support') : 'tank',
            kad: `${stat.kills || 0}/${stat.assists || 0}/${stat.deaths || 0}`
          };
        });

      while (teamStats.length < 5) {
        teamStats.push({
          playerId: '',
          role: 'tank',
          kad: '',
          damage: 0,
          healing: 0,
          mitigation: 0,
          teamId
        });
      }

      return teamStats;
    };

    const createPendingMapGame = (mapGame) => ({
      ...mapGame,
      team1Stats: buildTeamStats([], mapGame.team1Id),
      team2Stats: buildTeamStats([], mapGame.team2Id),
      team1AvailablePlayers: [],
      team2AvailablePlayers: [],
      isLoading: true
    });

    const normalizeTeamList = (list) => {
      if (!Array.isArray(list)) {
        return [];
      }

      return list.map((item) => {
        if (item && item.Team) {
          return item.Team;
        }
        return item;
      }).filter(item => item && item.id);
    };

    const ensureSelectedTeams = (baseTeams, selectedIds = []) => {
      const merged = [...baseTeams];
      selectedIds.forEach((id) => {
        if (!id) {
          return;
        }
        const exists = merged.some(team => team.id === id);
        if (!exists) {
          const fallbackTeam = teams.value.find(team => team.id === id);
          if (fallbackTeam) {
            merged.push(fallbackTeam);
          }
        }
      });
      return merged;
    };

    const loadMatchFilterTeams = async () => {
      if (!filterForm.value.seasonId) {
        matchFilterTeams.value = teams.value;
        return;
      }

      try {
        const seasonTeamsResult = await apiService.getSeasonTeams(filterForm.value.seasonId);
        matchFilterTeams.value = ensureSelectedTeams(
          normalizeTeamList(seasonTeamsResult),
          [filterForm.value.teamId]
        );
      } catch (error) {
        console.error('加载比赛筛选队伍失败:', error);
        matchFilterTeams.value = teams.value;
      }
    };

    const loadMatchEditTeams = async (seasonId, selectedIds = []) => {
      if (!seasonId) {
        matchEditTeams.value = ensureSelectedTeams(teams.value, selectedIds);
        return;
      }

      try {
        const seasonTeamsResult = await apiService.getSeasonTeams(seasonId);
        matchEditTeams.value = ensureSelectedTeams(
          normalizeTeamList(seasonTeamsResult),
          selectedIds
        );
      } catch (error) {
        console.error('加载比赛编辑队伍失败:', error);
        matchEditTeams.value = ensureSelectedTeams(teams.value, selectedIds);
      }
    };

    const isMapGameEditBusy = computed(() => {
      return mapGameSaving.value || mapGameEditLoading.value || mapGamesForEdit.value.some(item => item.isLoading);
    });
    

    
    // 加载比赛数据
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
        if (filterForm.value.dateRange && filterForm.value.dateRange[0]) {
          filters.startDate = filterForm.value.dateRange[0];
        }
        if (filterForm.value.dateRange && filterForm.value.dateRange[1]) {
          filters.endDate = filterForm.value.dateRange[1];
        }
        filters.page = currentPage.value;
        filters.pageSize = pageSize.value;
        
        console.log('发送筛选条件:', filters);
        
        // 调用API服务获取Match数据而不是MapGame数据
        const result = await apiService.getMatches(filters);
        
        // 处理返回的数据，支持多种可能的返回格式
        let matchData = [];
        if (Array.isArray(result)) {
          matchData = result;
        } else if (result && result.data && Array.isArray(result.data)) {
          matchData = result.data;
        } else if (result && result.list && Array.isArray(result.list)) {
          matchData = result.list;
        } else if (result && result.items && Array.isArray(result.items)) {
          matchData = result.items;
        }

        const matchTotal = Number(
          result?.total ?? result?.data?.total ?? result?.count ?? matchData.length
        );

        matches.value = matchData;
        total.value = Number.isFinite(matchTotal) ? matchTotal : matchData.length;
        
        console.log('加载比赛数据成功，共', total.value, '条');
      } catch (error) {
        console.error('加载比赛数据失败:', error);
        const errorMessage = error.response?.data?.error || error.message || '未知错误';
        ElMessage.error('加载比赛数据失败: ' + errorMessage);
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

    watch(() => filterForm.value.seasonId, async (seasonId, previousSeasonId) => {
      if (seasonId !== previousSeasonId) {
        filterForm.value.teamId = '';
      }
      await loadMatchFilterTeams();
    });

    watch(() => teams.value, () => {
      if (!filterForm.value.seasonId) {
        matchFilterTeams.value = teams.value;
      }
      if (!currentMatchForEdit.value?.seasonId) {
        matchEditTeams.value = teams.value;
      }
    }, { deep: true });

    watch(() => currentMatchForEdit.value?.seasonId, async (seasonId) => {
      if (!currentMatchForEdit.value) {
        return;
      }
      await loadMatchEditTeams(seasonId, [
        currentMatchForEdit.value.team1Id,
        currentMatchForEdit.value.team2Id
      ]);
    });
    
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
        dateRange: []
      };
      matchFilterTeams.value = teams.value;
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
    

    

    


    // 编辑比赛下的地图局数据
    const editMapGames = async (row) => {
      const requestId = ++latestMapGameEditRequestId;
      mapGameEditDialogVisible.value = true;
      currentMatchForEdit.value = row;
      mapGamesForEdit.value = [];
      mapGameEditTab.value = '0';
      mapGameEditLoading.value = true;
      loadMatchEditTeams(row.seasonId, [row.team1Id, row.team2Id]);

      try {
        const matchId = row.id;
        const result = await apiService.getMatchMapGames(matchId);
        
        let mapGamesData = [];
        if (Array.isArray(result)) {
          mapGamesData = result;
        } else if (result && result.data && Array.isArray(result.data)) {
          mapGamesData = result.data;
        }
        
        if (mapGamesData.length === 0) {
          ElMessage.info('该比赛暂无地图局数据');
          mapGameEditDialogVisible.value = false;
          return;
        }

        if (requestId !== latestMapGameEditRequestId) {
          return;
        }

        mapGamesForEdit.value = mapGamesData.map(createPendingMapGame);
        mapGameEditTab.value = mapGamesData[0]?.id?.toString() || '';

        Promise.allSettled(
          mapGamesData.map(async (mg) => {
            const targetMapGame = mapGamesForEdit.value.find(item => item.id === mg.id);
            try {
              const contextResult = await apiService.getMapGameEditContext(mg.id);
              const contextData = contextResult.data || contextResult;

              if (requestId !== latestMapGameEditRequestId || !targetMapGame) {
                return;
              }

              Object.assign(targetMapGame, {
                team1Stats: buildTeamStats(contextData.playerStats || [], mg.team1Id),
                team2Stats: buildTeamStats(contextData.playerStats || [], mg.team2Id),
                team1AvailablePlayers: normalizeAvailablePlayers(contextData.team1Players),
                team2AvailablePlayers: normalizeAvailablePlayers(contextData.team2Players)
              });
            } catch (contextError) {
              console.error(`加载地图局 ${mg.id} 详情失败:`, contextError);
              if (requestId === latestMapGameEditRequestId && targetMapGame) {
                ElMessage.warning(`地图局 ${getMapName(mg.mapId) || mg.id} 详情加载失败，请稍后重试`);
              }
            } finally {
              if (requestId === latestMapGameEditRequestId && targetMapGame) {
                targetMapGame.isLoading = false;
              }
            }
          })
        ).finally(() => {
          if (requestId === latestMapGameEditRequestId) {
            mapGameEditLoading.value = false;
          }
        });
      } catch (error) {
        console.error('获取比赛地图局数据失败:', error);
        ElMessage.error('获取地图局数据失败');
        mapGameEditDialogVisible.value = false;
      } finally {
        if (requestId === latestMapGameEditRequestId && mapGamesForEdit.value.length === 0) {
          mapGameEditLoading.value = false;
        }
      }
    };
    
    // 删除比赛
    const deleteMatch = async (id) => {
      try {
        await ElMessageBox.confirm('确定要删除这场比赛及其所有的地图局和选手数据吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await apiService.deleteMatch(id);
        ElMessage.success('比赛删除成功');
        loadMatches();
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message));
        }
      }
    };

    const resetMapGameEditForm = () => {
      latestMapGameEditRequestId += 1;
      currentMatchForEdit.value = null;
      mapGamesForEdit.value = [];
      mapGameEditTab.value = '0';
      matchEditTeams.value = [];
      mapGameEditLoading.value = false;
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

    const normalizePlayerRole = (role) => {
      if (role === 'tank' || role === 'damage' || role === 'support') {
        return role;
      }
      return '';
    };

    const normalizeAvailablePlayers = (playersList) => {
      if (!Array.isArray(playersList)) {
        return [];
      }

      return playersList
        .map((item) => {
          if (item?.Player) {
            return item.Player;
          }
          return item;
        })
        .filter(player => player && player.id);
    };

    const getMatchTeamPlayers = (mapGame, teamKey, role) => {
      const availablePlayers = teamKey === 'team1'
        ? mapGame?.team1AvailablePlayers
        : mapGame?.team2AvailablePlayers;

      const teamPlayers = Array.isArray(availablePlayers) ? availablePlayers : [];
      const normalizedRole = normalizePlayerRole(role);

      if (!normalizedRole) {
        return teamPlayers;
      }

      return teamPlayers.filter(player => normalizePlayerRole(player.role) === normalizedRole);
    };

    const handlePlayerChange = (stat) => {
      if (stat.playerId) {
        const player = store.state.players.find(p => p.id === stat.playerId);
        if (player) {
          stat.role = player.role === 'tank' ? 'tank' : player.role === 'damage' ? 'damage' : 'support';
        }
      }
    };

    const addStatRow = (statsArray, teamId) => {
      statsArray.push({
        playerId: '',
        role: 'tank',
        kad: '',
        damage: 0,
        healing: 0,
        mitigation: 0,
        teamId: teamId
      });
    };

    const clearStatRow = (stat) => {
      stat.playerId = '';
      stat.kad = '';
      stat.damage = 0;
      stat.healing = 0;
      stat.mitigation = 0;
    };

    const saveMapGameEdit = async () => {
      mapGameSaving.value = true;
      try {
        // 1. 保存 Match 的修改
        await apiService.updateMatch(currentMatchForEdit.value.id, {
          team1Id: currentMatchForEdit.value.team1Id,
          team2Id: currentMatchForEdit.value.team2Id,
          winnerId: currentMatchForEdit.value.winnerId,
          team1Score: currentMatchForEdit.value.team1Score,
          team2Score: currentMatchForEdit.value.team2Score,
          boFormat: currentMatchForEdit.value.boFormat
        });

        // 2. 保存 MapGame 的修改
        for (const mapGame of mapGamesForEdit.value) {
          const allStats = [...mapGame.team1Stats, ...mapGame.team2Stats];
          const playerStats = allStats
            .filter(ps => ps.playerId)
            .map(ps => {
              let kills = 0, assists = 0, deaths = 0;
              if (ps.kad) {
                const parts = ps.kad.split('/');
                if (parts.length === 3) {
                  kills = parseInt(parts[0]) || 0;
                  assists = parseInt(parts[1]) || 0;
                  deaths = parseInt(parts[2]) || 0;
                }
              }
              return {
                playerId: ps.playerId,
                teamId: ps.teamId,
                heroId: ps.heroId || null,
                kills,
                deaths,
                assists,
                damage: ps.damage || 0,
                healing: ps.healing || 0,
                mitigation: ps.mitigation || 0,
                ultsUsed: ps.ultsUsed || 0,
                finalBlows: ps.finalBlows || 0
              };
            });
          
          await apiService.updateMapGame(mapGame.id, {
            mapId: mapGame.mapId,
            winnerId: mapGame.winnerId,
            team1BanHeroId: mapGame.team1BanHeroId,
            team2BanHeroId: mapGame.team2BanHeroId,
            duration: mapGame.duration,
            playerStats: playerStats
          });
        }
        
        ElMessage.success('比赛及地图局数据保存成功');
        mapGameEditDialogVisible.value = false;
        await loadMatches();
      } catch (error) {
        ElMessage.error('保存数据失败: ' + error.message);
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
        stage: '',
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
      return players.value
        .filter(player => player.role === role)
        .sort((a, b) => a.name.localeCompare(b.name));
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
        // 1. 获取删除预览数据
        const checkResult = await apiService.getSeasonDeletePreview(id);
        
        // 2. 构建提示信息
        const message = `
          <p>确定要彻底删除该赛季吗？此操作将<strong>不可恢复</strong>。</p>
          <p>将删除以下关联数据：</p>
          <ul style="text-align: left; margin-left: 20px;">
            <li>比赛记录：${checkResult.matchesCount} 场</li>
            <li>小局记录：${checkResult.mapGamesCount} 局</li>
            <li>选手数据：${checkResult.playerStatsCount} 条</li>
            <li>参赛队伍：${checkResult.seasonTeamsCount} 支</li>
            <li>队伍成员记录：${checkResult.seasonTeamPlayersCount} 条</li>
            <li>赛季选手统计：${checkResult.seasonPlayerStatsCount} 条</li>
          </ul>
        `;

        await ElMessageBox.confirm(message, '彻底删除确认', {
          confirmButtonText: '确认彻底删除',
          cancelButtonText: '取消',
          type: 'warning',
          dangerouslyUseHTMLString: true,
          confirmButtonClass: 'el-button--danger'
        });
        
        await store.dispatch('deleteSeason', id);
        ElMessage.success('赛季及其关联数据已彻底删除');
        // 重新加载赛季数据
        await store.dispatch('loadBaseData');
      } catch (error) {
        if (error !== 'cancel') {
          console.error(error);
          ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message));
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
      matchFilterTeams.value = teams.value;
      loadMatches();
      loadChartConfig();
      
      window.addEventListener('resize', updateIsMobile);
    });
    
    return {
      pageTitleMap,
      activeTab,
      syncing,
      syncExternalMatches,
      filterForm,
      matchFilterTeams,
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
      matchEditTeams,
      mapGamesForEdit,
      mapGameEditLoading,
      mapGameSaving,
      isMapGameEditBusy,
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
      deleteMatch,
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
      handlePlayerChange,
      addStatRow,
      clearStatRow,
      chartConfig,
      saveChartConfig,
      seasonVisualForm,
      loadSeasonVisualConfig,
      saveSeasonVisualConfig,
      stageSegments,
      seasonVisualTeams,
      getStageOverride,
      handleOrderedTeamIdsChange,
      moveOrderedTeam,
      removeOrderedTeam,
      isMobile,
      actionColWidth,
      deleteActionColWidth,
      importDialogVisible,
      showImportDialog,
      handleImportSuccess,
      exportMode,
      selectedMatchIds,
      isExporting,
      toggleExportMode,
      handleSelectionChange,
      exportSelectedMatches
    };
  }
};
</script>

<style scoped>
.export-mode-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f0f9eb;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid #e1f3d8;
  margin-right: 8px;
}

.selected-count {
  font-size: 13px;
  color: #67c23a;
  font-weight: bold;
}

.chart-config-form {
  padding: 20px;
}

.config-section-title {
  margin: 20px 0 15px 0;
  font-size: 16px;
  font-weight: 600;
  color: #facc15;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-section-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 14px;
  background-color: #facc15;
}

.config-section-title:first-child {
  margin-top: 0;
}

.stage-overrides {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0 0 0;
}

.stage-override-card {
  border: 1px solid #333;
  border-radius: 2px;
  padding: 14px 14px 6px 14px;
  background: #1a1a1a;
}

.stage-override-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  font-weight: 600;
  color: #e0e0e0;
  font-family: 'Oxanium', sans-serif;
}

.stage-override-key {
  font-size: 12px;
  color: #888;
  font-family: 'Orbitron', sans-serif;
}

.ordered-list {
  margin-top: 10px;
  border: 1px solid #333;
  border-radius: 2px;
  padding: 8px;
  background: #222;
}

.ordered-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 4px;
  border-bottom: 1px dashed #444;
}

.ordered-row:last-child {
  border-bottom: none;
}

.ordered-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ordered-index {
  width: 22px;
  text-align: right;
  color: #888;
  font-family: 'Orbitron', sans-serif;
}

.ordered-name {
  font-weight: 600;
  color: #e0e0e0;
}

.ordered-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 新的选手数据表格样式 */
.map-game-loading {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #a3a3a3;
  font-size: 14px;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
}

.player-stats-container {
  margin-top: 10px;
}
.team-panel {
  background: #1a1a1a;
  border-radius: 2px;
  padding: 15px;
  border-left: 4px solid transparent;
  box-shadow: none;
  border: 1px solid #333;
}
.team-a-panel {
  border-left-color: #facc15; /* 原为橙色，现改为主题金 */
}
.team-b-panel {
  border-left-color: #a3a3a3; /* 原为青色，现改为灰色 */
}
.team-panel-title {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 16px;
  font-weight: 600;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
}
.a-title {
  color: #facc15;
}
.b-title {
  color: #a3a3a3;
}
.player-stats-header {
  display: flex;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  padding: 0 5px;
}
.player-stat-row {
  display: flex;
  margin-bottom: 10px;
  gap: 8px;
  align-items: center;
}
.col-name { flex: 3; }
.col-role { flex: 1.2; }
.col-kad { flex: 2; }
.col-dmg, .col-heal, .col-mit { flex: 2; }
.col-action { flex: 0 0 32px; display: flex; justify-content: center; }

.player-stat-row .el-input-number {
  width: 100%;
}

/* DataManage Container Scoped Styles */
.data-manage-container {
  padding: 30px;
  max-width: 100%;
  background-color: #0f0f0f;
  min-height: 100vh;
  color: #e0e0e0;
  --el-color-primary: #facc15;
  --el-color-primary-light-3: #fde047;
  --el-color-primary-light-5: #fef08a;
  --el-color-primary-light-7: #fef9c3;
  --el-color-primary-light-8: #fefce8;
  --el-color-primary-light-9: #ffffea;
  --el-color-primary-dark-2: #eab308;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 24px;
  color: #ffffff;
  padding-bottom: 16px;
  border-bottom: 2px solid #2a2a2a;
  display: flex;
  align-items: center;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
}

.page-title::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 28px;
  background-color: #facc15;
  margin-right: 12px;
  border-radius: 2px;
}

/* 现代化卡片样式 */
.data-card, .filter-card {
  border-radius: 2px;
  border: 1px solid #2a2a2a;
  box-shadow: none;
  margin-bottom: 24px;
  background: #141414;
  overflow: hidden;
}

.list-card :deep(.el-card__body) {
  padding: 0;
}

.list-card .pagination-container,
.list-card .empty-state {
  padding: 20px 24px;
}

:deep(.el-card__header) {
  border-bottom: 1px solid #2a2a2a;
  padding: 20px 24px;
  background-color: #1a1a1a;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
}

/* 现代化表格样式 */
:deep(.el-table) {
  border-radius: 2px;
  overflow: hidden;
  box-shadow: none;
  background-color: transparent;
  --el-table-border-color: #2a2a2a;
  --el-table-header-bg-color: #1a1a1a;
  --el-table-tr-bg-color: #141414;
}

:deep(.el-table th.el-table__cell) {
  background-color: #1a1a1a;
  color: #a3a3a3;
  font-weight: 600;
  border-bottom: 2px solid #2a2a2a;
  padding: 12px 0;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
}

:deep(.el-table td.el-table__cell) {
  border-bottom: 1px solid #2a2a2a;
  padding: 12px 0;
  background-color: #141414;
}

:deep(.el-table--border .el-table__cell) {
  border-right: 1px solid #2a2a2a;
}

:deep(.el-table--border) {
  border: 1px solid #2a2a2a;
}

.list-card :deep(.el-table--border) {
  border-left: none;
  border-right: none;
  border-bottom: none;
}

.list-card :deep(.el-table__inner-wrapper::before) {
  height: 0;
}

.match-up {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.match-up .winner {
  color: #facc15;
  font-weight: 600;
}

.vs {
  font-size: 12px;
  color: #555;
  margin: 0 8px;
  font-family: 'Orbitron', sans-serif;
  font-style: italic;
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  color: #666;
  font-family: 'Oxanium', sans-serif;
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

:deep(.el-tabs__nav-wrap) {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

:deep(.el-tabs__nav-wrap::-webkit-scrollbar) {
  display: none;
}

:deep(.el-tabs__nav) {
  flex-wrap: nowrap;
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
  background-color: #1a1a1a;
  border-radius: 2px;
  border: 1px solid #333;
}

.role-section h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  font-weight: 600;
  color: #facc15;
  font-family: 'Oxanium', sans-serif;
  letter-spacing: 1px;
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
  background-color: #222;
  border-radius: 2px;
  border: 1px solid #444;
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
  color: #e0e0e0;
}

.player-stats-form {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #444;
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
  color: #888;
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
