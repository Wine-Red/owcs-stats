<template>
  <div class="data-manage-container">
    <header class="admin-page-hero vis-clip-notch">
      <div class="admin-page-heading">
        <div class="admin-page-kicker">
          <span class="admin-slant-marker" aria-hidden="true"></span>
          <span>{{ pageSectionMap[activeTab] || 'DATA OPERATIONS' }}</span>
        </div>
        <h1>{{ pageTitleMap[activeTab] || '数据管理' }}</h1>
        <p>{{ pageDescriptionMap[activeTab] || '维护 OWCS Stats 的规范数据与展示配置。' }}</p>
      </div>
      <div class="admin-page-hero-actions">
        <div class="admin-mode-chip">
          <span class="admin-mode-dot" aria-hidden="true"></span>
          管理模式
        </div>
        <router-link to="/visualize" class="admin-preview-link">
          查看公开数据页
          <el-icon><ArrowRight /></el-icon>
        </router-link>
      </div>
    </header>

    <section class="admin-workbench" :aria-label="pageTitleMap[activeTab] || '数据管理'">

    <!-- 图表管理 -->
    <div v-if="activeTab === 'charts'">
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

    <div v-if="activeTab === 'season-visualize'">
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>赛季可视化配置</span>
            <el-button type="primary" @click="saveSeasonVisualConfig" :disabled="!seasonVisualForm.seasonId">保存配置</el-button>
          </div>
        </template>
        <el-form :model="seasonVisualForm" label-width="140px">
          <el-form-item label="赛季">
            <el-select v-model="seasonVisualForm.seasonId" filterable clearable placeholder="搜索赛季" style="width: 280px" @change="loadSeasonVisualConfig">
              <el-option
                v-for="season in seasons"
                :key="season.id"
                :label="season.name"
                :value="season.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="标签">
            <el-select
              v-model="seasonVisualForm.tags"
              multiple
              filterable
              clearable
              collapse-tags
              collapse-tags-tooltip
              allow-create
              default-first-option
              :reserve-keyword="false"
              style="width: 100%"
              placeholder="输入后回车新增标签"
            >
              <el-option v-for="tag in seasonVisualForm.tags" :key="tag" :label="tag" :value="tag" />
            </el-select>
          </el-form-item>
          <el-form-item label="复用其他赛季">
            <div class="visual-copy-row">
              <el-select
                v-model="seasonVisualCopySourceId"
                filterable
                clearable
                placeholder="选择要复用的源赛季"
                style="width: 280px"
                :disabled="!seasonVisualForm.seasonId"
              >
                <el-option
                  v-for="season in availableVisualCopySeasons"
                  :key="'copy-' + season.id"
                  :label="season.name"
                  :value="season.id"
                />
              </el-select>
              <el-button
                type="primary"
                plain
                :disabled="!seasonVisualForm.seasonId || !seasonVisualCopySourceId"
                @click="copySeasonVisualBaseConfig"
              >
                复制标签和地图池
              </el-button>
            </div>
            <div class="form-hint">只复制标签和地图池，不覆盖日期、Liquipedia 赛事页面或积分榜配置</div>
          </el-form-item>
          <el-form-item label="比赛日期">
            <el-input v-model="seasonVisualForm.dateRange" placeholder="如：2026.03.05 - 2026.04.12" style="width: 100%" />
          </el-form-item>
          <el-form-item
            label="Liquipedia赛事页面"
            title="仅使用赛事页面 URL 关联后续赛程"
            :error="liquipediaTournamentUrlError"
          >
            <el-input
              v-model.trim="seasonVisualForm.liquipediaTournamentUrl"
              type="url"
              inputmode="url"
              placeholder="https://liquipedia.net/overwatch/..."
              style="width: 100%"
              @input="liquipediaTournamentUrlError = ''"
              @blur="validateLiquipediaTournamentUrl"
            />
            <div class="form-hint">用于精确关联该赛事页面的 Upcoming 比赛，不再按赛事名称模糊匹配。</div>
          </el-form-item>
          <el-form-item label="地图池">
            <el-select
              v-model="seasonVisualForm.mapIds"
              multiple
              filterable
              clearable
              collapse-tags
              collapse-tags-tooltip
              style="width: 100%"
              placeholder="选择该赛季地图池"
              popper-class="map-type-dropdown"
              @visible-change="handleMapPoolDropdownVisible"
            >
              <div v-if="groupedMapsForSelect.length > 0" class="map-type-tabs-header">
                <button
                  v-for="group in groupedMapsForSelect"
                  :key="'map-tab-' + group.type"
                  class="map-type-tab"
                  :class="{ active: activeMapType === group.type }"
                  @click.stop="activeMapType = group.type"
                >
                  {{ group.label }}
                </button>
              </div>
              <template
                v-for="group in groupedMapsForSelect"
                :key="'map-group-' + group.type"
              >
                <el-option
                  v-for="map in group.maps"
                  :key="map.id"
                  :label="map.name"
                  :value="map.id"
                  :style="{ display: activeMapType === group.type ? '' : 'none' }"
                />
              </template>
            </el-select>
          </el-form-item>
          <el-form-item label="积分榜模板">
            <el-select v-model="seasonVisualForm.standingsTemplate" filterable clearable placeholder="搜索模板" style="width: 240px">
              <el-option label="W-L / Maps / +/-" value="wl_maps" />
              <el-option label="Points(3-0)" value="points_3_0" />
            </el-select>
          </el-form-item>
          <el-form-item label="世界赛晋级名额" title="积分榜前 N 名将显示晋级标识">
            <el-input-number v-model="seasonVisualForm.qualificationCount" :min="0" :max="20" placeholder="如：2" style="max-width: 240px" />
          </el-form-item>

          <el-divider content-position="left">积分榜阶段</el-divider>

          <div class="stage-manager">
            <div class="form-hint stage-manager-hint">
              每个阶段只需指定第一场比赛。下一阶段开始时，上一阶段自动结束；最后一个阶段会持续包含之后同步的新比赛。
            </div>
            <div class="stage-create-row">
              <el-input v-model="stageDraft.name" placeholder="阶段名称，例如：常规赛第一阶段" />
              <el-select
                v-if="seasonStages.length > 0"
                v-model="stageDraft.startMatchId"
                filterable
                clearable
                placeholder="选择本阶段第一场比赛"
              >
                <el-option
                  v-for="match in seasonStageMatches"
                  :key="`stage-start-${match.id}`"
                  :label="formatStageMatchLabel(match)"
                  :value="match.id"
                />
              </el-select>
              <div v-else class="stage-first-tip">首个阶段自动从赛季第一场开始</div>
              <el-button type="primary" :loading="stageSaving" @click="createStage">新增阶段</el-button>
            </div>

            <div v-if="seasonStages.length > 0" class="stage-definition-list">
              <div v-for="(stage, index) in seasonStages" :key="stage.id" class="stage-definition-row">
                <div class="stage-definition-index">{{ index + 1 }}</div>
                <el-input v-model="stage.name" class="stage-name-input" />
                <el-select
                  v-if="stage.startMatchId !== null"
                  v-model="stage.startMatchId"
                  class="stage-match-select"
                  filterable
                  clearable
                >
                  <el-option
                    v-for="match in seasonStageMatches"
                    :key="`stage-edit-${stage.id}-${match.id}`"
                    :label="formatStageMatchLabel(match)"
                    :value="match.id"
                  />
                </el-select>
                <div v-else class="stage-match-select stage-season-start">从赛季第一场开始</div>
                <div class="stage-range-summary">
                  <span>{{ formatStageRange(stage) }}</span>
                  <el-tag v-if="stage.isCurrent" size="small" type="success">自动延伸</el-tag>
                </div>
                <div class="stage-definition-actions">
                  <el-button size="small" @click="updateStage(stage)">保存</el-button>
                  <el-button size="small" type="danger" plain @click="deleteStage(stage)">删除</el-button>
                </div>
              </div>
            </div>
          </div>

          <el-divider v-if="stageSegments.length > 0" content-position="left">阶段积分榜覆盖</el-divider>

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
                  clearable
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
                  clearable
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
    <div v-if="activeTab === 'matches'">
      <el-alert
        title="比赛数据为只读镜像"
        description="具体比赛请在 Matchweb 修改或删除，Stats 会通过同步更新规范数据库。"
        type="info"
        show-icon
        :closable="false"
        style="margin-bottom: 16px"
      />
      <!-- 筛选条件 -->
    <el-card class="filter-card">
      <el-form :model="filterForm" inline>
        <el-form-item label="赛季">
          <el-select v-model="filterForm.seasonId" filterable clearable placeholder="搜索赛季" style="width: 200px">
            <el-option
              v-for="season in seasons"
              :key="season.id"
              :label="season.name"
              :value="season.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="队伍">
          <el-select v-model="filterForm.teamId" filterable clearable placeholder="搜索队伍" style="width: 200px">
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
            <template #default>
              <div class="action-buttons">
                <el-button type="primary" plain size="small" @click="openMatchweb">
                  <el-icon><Edit /></el-icon>
                  <span v-if="!isMobile">前往 Matchweb</span>
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

    <!-- 赛季管理 -->
    <div v-if="activeTab === 'seasons'">
      <el-card class="data-card list-card">
        <template #header>
          <div class="card-header">
            <div class="header-title-with-tabs">
              <span>赛季列表</span>
              <div v-if="groupedSeasonList.length > 0" class="management-tabs-header management-tabs-inline">
                <button
                  v-for="group in groupedSeasonList"
                  :key="'season-tab-' + group.stage"
                  class="management-tab"
                  :class="{ active: activeSeasonStage === group.stage }"
                  @click="activeSeasonStage = group.stage"
                >
                  {{ group.stage }}
                  <span class="management-tab-count">{{ group.seasons.length }}</span>
                </button>
              </div>
            </div>
            <div class="header-actions">
              <el-button type="primary" plain :loading="seasonOrderSaving" @click="saveVisualizeSeasonOrderConfig">
                保存可视化顺序
              </el-button>
              <el-button type="primary" @click="addSeason">
                <el-icon><Plus /></el-icon>
                添加赛季
              </el-button>
            </div>
          </div>
        </template>
        <div class="grouped-section-list" v-loading="loading">
          <el-table
            v-if="currentSeasonGroup"
            :data="currentSeasonGroup.seasons"
            style="width: 100%"
            border
          >
            <el-table-column label="图标" width="76" align="center">
              <template #default="scope">
                <div class="season-icon-cell" :class="{ 'is-empty': !scope.row.icon }">
                  <img v-if="scope.row.icon" :src="resolveMediaUrl(scope.row.icon)" :alt="`${scope.row.name} 图标`" />
                  <span v-else>—</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="赛季名称" min-width="220" />
            <el-table-column prop="externalEventName" label="外部事件关联名" min-width="220" />
            <el-table-column prop="stage" label="所属赛段" width="150" />
            <el-table-column label="可视化顺序" width="180" align="center">
              <template #default="scope">
                <div class="inline-order-actions">
                  <el-button size="small" @click="moveSeasonOrder(currentSeasonGroup.stage, scope.$index, -1)" :disabled="scope.$index === 0">上移</el-button>
                  <el-button size="small" @click="moveSeasonOrder(currentSeasonGroup.stage, scope.$index, 1)" :disabled="scope.$index === currentSeasonGroup.seasons.length - 1">下移</el-button>
                </div>
              </template>
            </el-table-column>
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
                  <el-button type="primary" size="small" :aria-label="`编辑${scope.row.name}`" @click="editSeason(scope.row)">
                    <el-icon><Edit /></el-icon>
                    <span v-if="!isMobile">编辑</span>
                  </el-button>
                  <el-button type="danger" size="small" :aria-label="`删除${scope.row.name}`" @click="deleteSeason(scope.row.id)">
                    <el-icon><Delete /></el-icon>
                    <span v-if="!isMobile">删除</span>
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>
    </div>

    <!-- 队伍管理 -->
    <div v-if="activeTab === 'teams'">
      <section class="entity-workspace" v-loading="loading">
        <div class="entity-toolbar">
          <div class="entity-toolbar-title">
            <strong>队伍目录</strong>
            <span>{{ teams.length }} 支 · 图片 {{ getMediaCoverage(teams, 'logo') }}</span>
          </div>
          <el-input v-model="teamSearch" clearable placeholder="搜索主名、别名或地区" class="entity-search">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button type="primary" @click="addTeam"><el-icon><Plus /></el-icon>新增队伍</el-button>
        </div>
        <div v-if="groupedTeamsByRegion.length" class="entity-filter-strip">
          <button
            v-for="group in groupedTeamsByRegion"
            :key="`team-region-${group.key}`"
            :class="{ active: activeTeamRegion === group.key }"
            @click="activeTeamRegion = group.key"
          >{{ group.label }} <span>{{ group.teams.length }}</span></button>
        </div>
        <div v-if="filteredTeamCatalog.length" class="entity-card-grid entity-card-grid--teams">
          <article v-for="team in filteredTeamCatalog" :key="team.id" class="entity-card team-card" role="button" tabindex="0" title="打开队伍历史档案" @click="openTeamContext(team)" @keydown.enter="openTeamContext(team)" @keydown.space.prevent="openTeamContext(team)">
            <div class="entity-thumb entity-thumb--logo">
              <img v-if="team.logo" :src="resolveMediaUrl(team.logo)" :alt="team.name" />
              <span v-else>{{ team.name.slice(0, 2).toUpperCase() }}</span>
            </div>
            <div class="entity-card-copy">
              <div class="entity-card-heading"><strong>{{ team.name }}</strong><span>{{ team.region || '未分区' }}</span></div>
              <div v-if="team.aliases?.length" class="entity-card-tags">
                <span v-for="alias in team.aliases.slice(0, 3)" :key="alias">{{ alias }}</span>
                <span v-if="team.aliases.length > 3">+{{ team.aliases.length - 3 }}</span>
              </div>
              <span v-else class="entity-card-muted">暂无同步别名</span>
            </div>
            <div class="entity-card-actions" @click.stop>
              <button type="button" @click="openTeamContext(team)">历史</button>
              <button type="button" @click="editTeam(team)">编辑</button>
              <button type="button" class="danger" @click="deleteTeam(team.id)">删除</button>
            </div>
          </article>
        </div>
        <el-empty v-else description="没有符合条件的队伍" />
      </section>
    </div>

    <!-- 英雄管理 -->
    <div v-if="activeTab === 'heroes'">
      <section class="entity-workspace" v-loading="loading">
        <div class="entity-toolbar">
          <div class="entity-toolbar-title"><strong>英雄目录</strong><span>{{ heroes.length }} 名 · 图片 {{ getMediaCoverage(heroes, 'image') }}</span></div>
          <el-input v-model="heroSearch" clearable placeholder="搜索英雄或子职责" class="entity-search"><template #prefix><el-icon><Search /></el-icon></template></el-input>
          <el-button type="primary" @click="addHero"><el-icon><Plus /></el-icon>新增英雄</el-button>
        </div>
        <div class="entity-filter-strip">
          <button v-for="group in groupedHeroesForManagement" :key="group.role" :class="{ active: activeHeroRole === group.role }" @click="activeHeroRole = group.role">
            {{ getRoleText(group.role) }} <span>{{ group.heroes.length }}</span>
          </button>
        </div>
        <div v-if="filteredHeroCatalog.length" class="entity-card-grid entity-card-grid--catalog">
          <article v-for="hero in filteredHeroCatalog" :key="hero.id" class="entity-card catalog-card">
            <div class="entity-thumb entity-thumb--hero"><img v-if="hero.image" :src="resolveMediaUrl(hero.image)" :alt="hero.name" /><span v-else>NO IMAGE</span></div>
            <div class="entity-card-copy"><div class="entity-card-heading"><strong>{{ hero.name }}</strong><span>{{ hero.subRole || getRoleText(hero.role) }}</span></div><small>{{ mediaSourceState(hero.image).label }}</small></div>
            <div class="entity-card-actions"><button type="button" @click="editHero(hero)">编辑</button><button type="button" class="danger" @click="deleteHero(hero.id)">删除</button></div>
          </article>
        </div>
        <el-empty v-else description="没有符合条件的英雄" />
      </section>
    </div>

    <!-- 地图管理 -->
    <div v-if="activeTab === 'maps'">
      <section class="entity-workspace" v-loading="loading">
        <div class="entity-toolbar">
          <div class="entity-toolbar-title"><strong>地图目录</strong><span>{{ maps.length }} 张 · 图片 {{ getMediaCoverage(maps, 'image') }}</span></div>
          <el-input v-model="mapSearch" clearable placeholder="搜索地图或模式" class="entity-search"><template #prefix><el-icon><Search /></el-icon></template></el-input>
          <el-button type="primary" @click="addMap"><el-icon><Plus /></el-icon>新增地图</el-button>
        </div>
        <div class="entity-filter-strip">
          <button v-for="group in groupedMapsForManagement" :key="group.type" :class="{ active: activeCatalogMapType === group.type }" @click="activeCatalogMapType = group.type">
            {{ group.type }} <span>{{ group.maps.length }}</span>
          </button>
        </div>
        <div v-if="filteredMapCatalog.length" class="entity-card-grid entity-card-grid--maps">
          <article v-for="map in filteredMapCatalog" :key="map.id" class="entity-card map-card">
            <div class="entity-thumb entity-thumb--map"><img v-if="map.image" :src="resolveMediaUrl(map.image)" :alt="map.name" /><span v-else>NO IMAGE</span></div>
            <div class="entity-card-copy"><div class="entity-card-heading"><strong>{{ map.name }}</strong><span>{{ map.type }}</span></div><small>{{ mediaSourceState(map.image).label }}</small></div>
            <div class="entity-card-actions"><button type="button" @click="editMap(map)">编辑</button><button type="button" class="danger" @click="deleteMap(map.id)">删除</button></div>
          </article>
        </div>
        <el-empty v-else description="没有符合条件的地图" />
      </section>
    </div>

    <!-- 选手管理 -->
    <div v-if="activeTab === 'players'">
      <section class="entity-workspace" v-loading="loading">
        <div class="entity-toolbar">
          <div class="entity-toolbar-title"><strong>选手身份库</strong><span>{{ players.length }} 名规范身份</span></div>
          <el-input v-model="playerSearch" clearable placeholder="搜索选手名称" class="entity-search"><template #prefix><el-icon><Search /></el-icon></template></el-input>
          <el-button type="primary" @click="addPlayer(playerRoleFilter === 'all' ? 'tank' : playerRoleFilter)"><el-icon><Plus /></el-icon>新增选手</el-button>
        </div>
        <div class="entity-filter-strip">
          <button v-for="role in ['all', 'tank', 'damage', 'support']" :key="role" :class="{ active: playerRoleFilter === role }" @click="playerRoleFilter = role">
            {{ role === 'all' ? '全部' : getRoleText(role) }} <span>{{ role === 'all' ? players.length : getPlayersByRole(role).length }}</span>
          </button>
        </div>
        <div v-if="filteredPlayerCatalog.length" class="entity-card-grid entity-card-grid--players">
          <article v-for="player in filteredPlayerCatalog" :key="player.id" class="entity-card player-card" :class="{ 'is-orphan': player.orphanedAt }" role="button" tabindex="0" title="打开选手历史档案" @click="openPlayerContext(player)" @keydown.enter="openPlayerContext(player)" @keydown.space.prevent="openPlayerContext(player)">
            <div class="player-monogram">{{ player.name.slice(0, 2).toUpperCase() }}</div>
            <div class="entity-card-copy"><div class="entity-card-heading"><strong>{{ player.name }}</strong><span>{{ getRoleText(player.role) }}</span></div><small>{{ player.orphanedAt ? '孤儿身份 · 需要排查' : identityOriginText(player.identityOrigin) }}</small></div>
            <div class="entity-card-actions" @click.stop><button type="button" @click="openPlayerContext(player)">履历</button><button type="button" @click="editPlayer(player)">编辑</button><button type="button" class="danger" @click="deletePlayer(player.id)">删除</button></div>
          </article>
        </div>
        <el-empty v-else description="没有符合条件的选手" />
      </section>
    </div>

    <!-- 赛季-队伍关联管理 -->
    <div v-if="activeTab === 'season-teams'">
      <section class="relation-workspace">
        <div class="relation-commandbar">
          <div><strong>参赛队伍配置</strong><span>先选赛季，再批量加入；同步证据会继续保留。</span></div>
          <el-select v-model="seasonTeamFilter.seasonId" filterable clearable placeholder="搜索赛季" @change="loadSeasonTeams">
            <el-option v-for="season in seasons" :key="season.id" :label="season.name" :value="season.id" />
          </el-select>
          <el-select v-model="seasonTeamAddIds" multiple filterable clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="2" placeholder="搜索并选择要加入的队伍" :disabled="!seasonTeamFilter.seasonId">
            <el-option v-for="team in availableSeasonTeamCatalog" :key="team.id" :label="`${team.name}${team.region ? ` · ${team.region}` : ''}`" :value="team.id" />
          </el-select>
          <el-button type="primary" :disabled="!seasonTeamAddIds.length" :loading="relationSaving" @click="addSeasonTeamsInline"><el-icon><Plus /></el-icon>批量加入</el-button>
        </div>
        <div v-if="seasonTeamFilter.seasonId && seasonTeams.length" class="relation-card-grid">
          <article v-for="relation in seasonTeams" :key="relation.id" class="relation-card">
            <div class="relation-team-logo"><img v-if="getTeamById(relation.teamId)?.logo" :src="resolveMediaUrl(getTeamById(relation.teamId).logo)" :alt="getTeamName(relation.teamId)" /><span v-else>{{ getTeamName(relation.teamId).slice(0, 2) }}</span></div>
            <div class="relation-card-copy"><strong>{{ getTeamName(relation.teamId) }}</strong><span>{{ getSeasonName(relation.seasonId) }}</span><div class="relation-sources"><em v-for="source in membershipSourceTypes(relation)" :key="source">{{ membershipSourceLabel(source) }}</em><em v-if="!membershipSourceTypes(relation).length">无来源</em></div></div>
            <div class="relation-card-count"><strong>{{ relation.players?.length || relation.rosterCount || 0 }}</strong><span>阵容关系</span></div>
            <div class="relation-card-actions"><button type="button" @click="manageSeasonTeamRoster(relation)">管理阵容</button><button type="button" class="danger" @click="deleteSeasonTeam(relation.id)">移除手工来源</button></div>
          </article>
        </div>
        <el-empty v-else :description="seasonTeamFilter.seasonId ? '该赛季还没有参赛队伍' : '请先选择一个赛季'" />
      </section>
    </div>

    <!-- 赛季-队伍-选手关联管理 -->
    <div v-if="activeTab === 'season-team-players'">
      <section class="relation-workspace">
        <div class="relation-commandbar roster-commandbar">
          <div><strong>赛季阵容工作台</strong><span>来源标签说明为什么关系仍然存在；移除只撤销手工来源。</span></div>
          <el-select v-model="seasonTeamPlayerFilter.seasonId" filterable clearable placeholder="搜索赛季" @change="loadSeasonTeamsForPlayers">
            <el-option v-for="season in seasons" :key="season.id" :label="season.name" :value="season.id" />
          </el-select>
          <el-select v-model="seasonTeamPlayerFilter.seasonTeamId" filterable clearable placeholder="搜索赛季内队伍" :disabled="!seasonTeamPlayerFilter.seasonId" @change="loadSeasonTeamPlayers">
            <el-option v-for="relation in seasonTeams" :key="relation.id" :label="getTeamName(relation.teamId)" :value="relation.id" />
          </el-select>
        </div>
        <div v-if="seasonTeamPlayerFilter.seasonTeamId" class="roster-addbar">
          <div><strong>{{ selectedRosterTeamName }}</strong><span>当前 {{ seasonTeamPlayers.length }} 条成员关系</span></div>
          <el-select v-model="rosterAddPlayerIds" multiple filterable clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="3" placeholder="输入选手名，支持多选">
            <el-option-group v-for="group in rosterCandidateGroups" :key="group.role" :label="getRoleText(group.role)">
              <el-option v-for="player in group.players" :key="player.id" :label="`${player.name} · ${getRoleText(player.role)}`" :value="player.id" />
            </el-option-group>
          </el-select>
          <el-button type="primary" :disabled="!rosterAddPlayerIds.length" :loading="relationSaving" @click="addRosterPlayersInline"><el-icon><Plus /></el-icon>加入阵容</el-button>
        </div>
        <div v-if="seasonTeamPlayerFilter.seasonTeamId && seasonTeamPlayers.length" class="roster-role-grid">
          <section v-for="role in ['tank', 'damage', 'support']" :key="role" class="roster-role-column">
            <header><strong>{{ getRoleText(role) }}</strong><span>{{ rosterPlayersByRole(role).length }}</span></header>
            <article v-for="relation in rosterPlayersByRole(role)" :key="relation.id" class="roster-player-row" role="button" tabindex="0" @click="openPlayerContext(relation.Player || getPlayerById(relation.playerId))" @keydown.enter="openPlayerContext(relation.Player || getPlayerById(relation.playerId))">
              <div class="player-monogram small">{{ (relation.Player?.name || getPlayerName(relation.playerId)).slice(0, 2).toUpperCase() }}</div>
              <div><strong>{{ relation.Player?.name || getPlayerName(relation.playerId) }}</strong><span class="relation-sources"><em v-for="source in membershipSourceTypes(relation)" :key="source">{{ membershipSourceLabel(source) }}</em></span></div>
              <button type="button" class="danger" @click.stop="deleteSeasonTeamPlayer(relation.id)">移除手工来源</button>
            </article>
            <div v-if="!rosterPlayersByRole(role).length" class="roster-empty">暂无{{ getRoleText(role) }}关系</div>
          </section>
        </div>
        <el-empty v-else :description="seasonTeamPlayerFilter.seasonTeamId ? '该队伍还没有阵容关系' : '选择赛季和队伍后管理阵容'" />
      </section>
    </div>


    
    </section>

    <entity-context-drawer
      v-model="entityContextVisible"
      :type="entityContextType"
      :entity="entityContextEntity"
      :context="entityContext"
      :loading="entityContextLoading"
      @edit="editContextEntity"
    />

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
            <el-select v-model="editForm.status" filterable clearable placeholder="搜索状态" style="width: 100%">
              <el-option label="进行中" value="in_progress" />
              <el-option label="已完成" value="completed" />
            </el-select>
          </el-form-item>
          <el-form-item label="赛季图标">
            <media-upload-field
              :model-value="editForm.icon"
              :entity-name="editForm.name || '新赛季'"
              variant="logo"
              @file-change="handleMediaFileChange"
              @clear="handleMediaClear"
            />
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
        <el-form-item label="同步别名">
          <el-select
            v-model="editForm.aliases"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            allow-create
            default-first-option
            :reserve-keyword="false"
            placeholder="输入 Matchweb 使用的名称并按 Enter"
            class="team-alias-editor"
          />
          <div class="form-hint team-alias-hint">
            Matchweb 命中任一别名时都会归入主名“{{ editForm.name || '未命名队伍' }}”；公开页面始终只显示主名。
          </div>
        </el-form-item>
        <el-form-item label="队伍 Logo">
          <media-upload-field
            :model-value="editForm.logo"
            :entity-name="editForm.name || '新队伍'"
            variant="logo"
            @file-change="handleMediaFileChange"
            @clear="handleMediaClear"
          />
        </el-form-item>
      </el-form>
    </div>

      <!-- 英雄编辑 -->
      <div v-if="dialogType === 'hero'">
        <el-form :model="editForm" :rules="heroRules" ref="editFormRef" label-width="120px">
          <el-form-item label="英雄名称" prop="name">
            <el-input v-model="editForm.name" placeholder="请输入英雄名称" />
          </el-form-item>
          <el-form-item label="职责" prop="role">
            <el-select v-model="editForm.role" filterable clearable placeholder="搜索职责" style="width: 100%">
              <el-option label="重装" value="tank" />
              <el-option label="输出" value="damage" />
              <el-option label="支援" value="support" />
            </el-select>
          </el-form-item>
          <el-form-item label="子职责" prop="subRole">
            <el-input v-model="editForm.subRole" placeholder="例如：先锋、神准、战术" />
          </el-form-item>
          <el-form-item label="英雄图片">
            <media-upload-field
              :model-value="editForm.image"
              :entity-name="editForm.name || '新英雄'"
              variant="logo"
              @file-change="handleMediaFileChange"
              @clear="handleMediaClear"
            />
          </el-form-item>
        </el-form>
      </div>

      <!-- 地图编辑 -->
      <div v-if="dialogType === 'map'">
        <el-form :model="editForm" :rules="mapRules" ref="editFormRef" label-width="120px">
          <el-form-item label="地图名称" prop="name">
            <el-input v-model="editForm.name" placeholder="请输入地图名称" />
          </el-form-item>
          <el-form-item label="地图模式" prop="type">
            <el-select v-model="editForm.type" filterable clearable placeholder="搜索地图模式" style="width: 100%">
              <el-option v-for="type in MAP_TYPE_ORDER" :key="type" :label="type" :value="type" />
            </el-select>
          </el-form-item>
          <el-form-item label="地图图片">
            <media-upload-field
              :model-value="editForm.image"
              :entity-name="editForm.name || '新地图'"
              variant="banner"
              @file-change="handleMediaFileChange"
              @clear="handleMediaClear"
            />
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
            <el-select v-model="editForm.role" filterable clearable placeholder="搜索位置" style="width: 100%">
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
            <el-select v-model="editForm.seasonId" filterable clearable placeholder="搜索赛季" style="width: 100%" @change="handleSeasonChangeForTeams">
              <el-option
                v-for="season in seasons"
                :key="season.id"
                :label="season.name"
                :value="season.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="队伍" prop="teamIds">
            <el-select v-model="editForm.teamIds" placeholder="搜索并选择队伍" style="width: 100%" multiple filterable clearable collapse-tags collapse-tags-tooltip>
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
            <el-select v-model="editForm.seasonTeamId" filterable clearable placeholder="搜索赛季-队伍" style="width: 100%" @change="handleSeasonTeamChangeForPlayers">
              <el-option
                v-for="seasonTeam in seasonTeams"
                :key="seasonTeam.id"
                :label="getTeamName(seasonTeam.teamId)"
                :value="seasonTeam.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="选手" prop="playerIds">
            <el-select v-model="editForm.playerIds" placeholder="搜索并选择选手" style="width: 100%" multiple filterable clearable collapse-tags collapse-tags-tooltip>
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
                  <el-select v-model="currentMatchForEdit.team1Id" filterable clearable placeholder="搜索队伍" style="width: 100%">
                    <el-option v-for="team in matchEditTeams" :key="team.id" :label="team.name" :value="team.id" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="队伍2 (右侧)">
                  <el-select v-model="currentMatchForEdit.team2Id" filterable clearable placeholder="搜索队伍" style="width: 100%">
                    <el-option v-for="team in matchEditTeams" :key="team.id" :label="team.name" :value="team.id" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="大场获胜方">
                  <el-select v-model="currentMatchForEdit.winnerId" filterable clearable placeholder="搜索获胜队伍" style="width: 100%">
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
                  <el-select v-model="currentMatchForEdit.boFormat" filterable clearable placeholder="搜索赛制，如 BO5" style="width: 100%">
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
                  <el-select v-model="mapGame.mapId" filterable clearable placeholder="搜索地图" style="width: 100%">
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
                  <el-select v-model="mapGame.winnerId" filterable clearable placeholder="搜索获胜队伍" style="width: 100%">
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
                  <el-select v-model="mapGame.team1BanHeroId" filterable placeholder="搜索 Ban 英雄" style="width: 100%" clearable>
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
                  <el-select v-model="mapGame.team2BanHeroId" filterable placeholder="搜索 Ban 英雄" style="width: 100%" clearable>
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
                <el-form-item label="数据结构版本">
                  <el-input-number v-model="mapGame.statsVersion" :min="1" :step="1" style="width: 100%" />
                </el-form-item>
              </el-form>

              <div class="player-editor-grid">
                <PlayerStatsEditor
                  :stats="mapGame.team1Stats"
                  :title="`${getTeamName(currentMatchForEdit.team1Id)} 选手数据`"
                  :team-id="currentMatchForEdit.team1Id"
                  :available-players="mapGame.team1AvailablePlayers"
                  :fallback-players="players"
                  :heroes="heroes"
                  accent="#facc15"
                  @add-row="addStatRow(mapGame.team1Stats, currentMatchForEdit.team1Id)"
                />
                <PlayerStatsEditor
                  :stats="mapGame.team2Stats"
                  :title="`${getTeamName(currentMatchForEdit.team2Id)} 选手数据`"
                  :team-id="currentMatchForEdit.team2Id"
                  :available-players="mapGame.team2AvailablePlayers"
                  :fallback-players="players"
                  :heroes="heroes"
                  accent="#a3a3a3"
                  @add-row="addStatRow(mapGame.team2Stats, currentMatchForEdit.team2Id)"
                />
              </div>

              <div v-if="false" class="player-stats-container">
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
                          <el-select v-model="stat.playerId" placeholder="搜索选手" filterable clearable @change="handlePlayerChange(stat)">
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
                          <el-select v-model="stat.role" filterable clearable @change="stat.playerId = ''">
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
                          <el-select v-model="stat.playerId" placeholder="搜索选手" filterable clearable @change="handlePlayerChange(stat)">
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
                          <el-select v-model="stat.role" filterable clearable @change="stat.playerId = ''">
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
  ArrowRight, Search, Refresh, Edit, Delete, Plus, Download
} from '@element-plus/icons-vue';
import apiService from '../../services/api';
import MapDataImport from './components/MapDataImport.vue';
import PlayerStatsEditor from './components/PlayerStatsEditor.vue';
import MediaUploadField from './components/MediaUploadField.vue';
import EntityContextDrawer from './components/EntityContextDrawer.vue';
import { mediaSourceState, resolveMediaUrl } from '@/utils/media';
import {
  isValidLiquipediaTournamentUrl,
  normalizeLiquipediaTournamentUrl
} from '@/utils/liquipediaTournament.mjs';

export default {
  name: 'DataManage',
  components: {
    Search,
    ArrowRight,
    Refresh,
    Edit,
    Delete,
    Plus,
    Download,
    MapDataImport,
    PlayerStatsEditor,
    MediaUploadField,
    EntityContextDrawer
  },
  setup() {
    // 页面标题映射
    const pageTitleMap = {
      'seasons': '赛季管理',
      'season-visualize': '赛季可视化配置',
      'teams': '队伍管理',
      'heroes': '英雄管理',
      'maps': '地图管理',
      'players': '选手管理',
      'season-teams': '赛季-队伍关联',
      'season-team-players': '赛季-队伍-选手关联',
      'charts': '全局设置',
      'matches': '比赛管理'
    };
    const pageSectionMap = {
      'seasons': 'COMPETITION STRUCTURE',
      'season-visualize': 'PUBLIC PRESENTATION',
      'teams': 'TEAM DIRECTORY',
      'heroes': 'GAME CATALOG',
      'maps': 'GAME CATALOG',
      'players': 'PLAYER DIRECTORY',
      'season-teams': 'ROSTER EVIDENCE',
      'season-team-players': 'ROSTER EVIDENCE',
      'charts': 'DISPLAY CONTROL',
      'matches': 'MATCHWEB MIRROR'
    };
    const pageDescriptionMap = {
      'seasons': '组织赛事、赛段与外部事件映射，控制公开页面的赛事顺序。',
      'season-visualize': '配置公开数据页中的赛事标签、地图池、阶段与积分榜呈现。',
      'teams': '维护队伍主名、同步别名和公开展示使用的 Logo。',
      'heroes': '维护英雄名称、职责分类与公开页面图片资源。',
      'maps': '维护地图名称、模式分类与公开页面横幅资源。',
      'players': '按职责浏览和维护规范选手身份。',
      'season-teams': '配置赛前参赛队伍，并查看比赛同步产生的关系证据。',
      'season-team-players': '配置赛季阵容与替补，并查看比赛出场产生的关系证据。',
      'charts': '控制公开数据页可见的数据模块，不影响底层比赛数据。',
      'matches': '只读查看 Matchweb 同步结果、导出比赛并检查数据状态。'
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
    const activeTab = ref(route.path.split('/').pop() || 'seasons');
    
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
        
        let extraText = '';
        if (data.seasonImportSummary && data.seasonImportSummary.length > 0) {
          extraText = ` [赛季聚合预导入: ` + data.seasonImportSummary.join('；') + `]`;
        }

        if (data.errors && data.errors.length > 0) {
          ElMessage.warning(`同步结束。${summaryText}。但有 ${data.errors.length} 场失败（请看控制台日志）。${extraText}`);
          console.warn('同步失败的比赛详情:', data.errors);
        } else {
          ElMessage.success(`同步完成！${summaryText}${extraText}`);
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
    const seasonTeamAddIds = ref([]);
    
    // 赛季-队伍-选手关联筛选
    const seasonTeamPlayerFilter = ref({
      seasonId: '',
      seasonTeamId: ''
    });
    const rosterAddPlayerIds = ref([]);
    const relationSaving = ref(false);

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
      liquipediaTournamentUrl: '',
      mapIds: [],
      standingsTemplate: 'wl_maps',
      stageOverrides: {}
    });

    const OTHER_STAGE_LABEL = '其他赛季';
    const UNGROUPED_REGION_LABEL = '未分区';
    const VISUALIZE_STAGE_ORDER_KEY = 'visualize_stage_season_order';
    const MAP_TYPE_ORDER = ['占领要点', '运载目标', '攻击/护送', '机动推进', '闪点作战'];

    const buildSeasonVisualKey = (seasonId) => `visualize_season_${seasonId}`;
    const liquipediaTournamentUrlError = ref('');

    const validateLiquipediaTournamentUrl = () => {
      const value = String(seasonVisualForm.value.liquipediaTournamentUrl || '').trim();
      liquipediaTournamentUrlError.value = value && !isValidLiquipediaTournamentUrl(value)
        ? '请输入有效的 Liquipedia Overwatch 赛事页面 URL'
        : '';
      return !liquipediaTournamentUrlError.value;
    };

    const normalizeStringArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(v => String(v).trim()).filter(Boolean);
    };

    const normalizeIdArray = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(v => Number(v)).filter(v => Number.isFinite(v));
    };

    const normalizeStageLabel = (stage) => {
      const value = String(stage || '').trim();
      return value || OTHER_STAGE_LABEL;
    };

    const normalizeRegionLabel = (region) => {
      const value = String(region || '').trim();
      return value || UNGROUPED_REGION_LABEL;
    };

    const seasonStages = ref([]);
    const seasonStageMatches = ref([]);
    const stageSaving = ref(false);
    const stageDraft = ref({ name: '', startMatchId: null });

    const stageSegments = computed(() => seasonStages.value.map((stage, index) => ({
      key: `stage:${stage.id}`,
      label: String(stage.name || `阶段${index + 1}`),
      stageId: stage.id
    })));

    const loadSeasonStages = async (seasonId) => {
      if (!seasonId) {
        seasonStages.value = [];
        seasonStageMatches.value = [];
        return;
      }
      try {
        const [stageRes, matchRes] = await Promise.all([
          apiService.getSeasonStages(seasonId),
          apiService.getMatches({ seasonId, pageSize: 1000 })
        ]);
        seasonStages.value = Array.isArray(stageRes) ? stageRes : stageRes?.data || [];
        const matchList = Array.isArray(matchRes) ? matchRes : matchRes?.list || matchRes?.data || [];
        seasonStageMatches.value = matchList.slice().sort((left, right) => {
          const dateCompare = String(left.matchDate || '').localeCompare(String(right.matchDate || ''));
          return dateCompare || Number(left.id) - Number(right.id);
        });
      } catch (e) {
        seasonStages.value = [];
        seasonStageMatches.value = [];
      }
    };

    const formatStageMatchLabel = (match) => {
      const date = String(match?.matchDate || '日期未知');
      return `${date} · ${getTeamName(match?.team1Id)} vs ${getTeamName(match?.team2Id)}`;
    };

    const formatStageRange = (stage) => {
      if (!stage?.matchCount) return '当前范围暂无比赛';
      const start = stage.startMatch ? formatStageMatchLabel(stage.startMatch) : '赛季首场';
      const end = stage.endMatch ? formatStageMatchLabel(stage.endMatch) : '当前最新比赛';
      return `${start} → ${end} · ${stage.matchCount} 场`;
    };

    const createStage = async () => {
      const name = String(stageDraft.value.name || '').trim();
      if (!name) return ElMessage.warning('请输入阶段名称');
      if (seasonStages.value.length > 0 && !stageDraft.value.startMatchId) {
        return ElMessage.warning('请选择新阶段的第一场比赛');
      }
      stageSaving.value = true;
      try {
        await apiService.createSeasonStage(seasonVisualForm.value.seasonId, {
          name,
          startMatchId: stageDraft.value.startMatchId
        });
        stageDraft.value = { name: '', startMatchId: null };
        await loadSeasonStages(seasonVisualForm.value.seasonId);
        ElMessage.success('阶段已新增，后续比赛将自动归入当前阶段');
      } catch (error) {
        ElMessage.error(error?.response?.data?.error || '新增阶段失败');
      } finally {
        stageSaving.value = false;
      }
    };

    const updateStage = async (stage) => {
      try {
        await apiService.updateSeasonStage(stage.id, {
          name: String(stage.name || '').trim(),
          startMatchId: stage.startMatchId
        });
        await loadSeasonStages(seasonVisualForm.value.seasonId);
        ElMessage.success('阶段已更新');
      } catch (error) {
        ElMessage.error(error?.response?.data?.error || '更新阶段失败');
      }
    };

    const deleteStage = async (stage) => {
      try {
        await ElMessageBox.confirm(
          `确定删除阶段“${stage.name}”吗？比赛数据不会被删除，相邻阶段的范围会自动重新计算。`,
          '删除阶段',
          { type: 'warning' }
        );
        await apiService.deleteSeasonStage(stage.id);
        await loadSeasonStages(seasonVisualForm.value.seasonId);
        ElMessage.success('阶段已删除');
      } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
          ElMessage.error(error?.response?.data?.error || '删除阶段失败');
        }
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
        const liquipediaTournamentUrl = config?.liquipediaTournamentUrl || '';
        const mapIds = normalizeIdArray(config?.mapPool?.mapIds);
        const standingsTemplate = config?.standings?.template === 'points_3_0' ? 'points_3_0' : 'wl_maps';
        const stageOverrides = (config?.standings?.stageOverrides && typeof config.standings.stageOverrides === 'object')
          ? config.standings.stageOverrides
          : {};
        const qualificationCount = Number(config?.standings?.qualificationCount) || 0;

        seasonVisualForm.value.tags = tags;
        seasonVisualForm.value.dateRange = dateRange;
        seasonVisualForm.value.liquipediaTournamentUrl = liquipediaTournamentUrl;
        liquipediaTournamentUrlError.value = '';
        seasonVisualForm.value.mapIds = mapIds;
        seasonVisualForm.value.standingsTemplate = standingsTemplate;
        seasonVisualForm.value.qualificationCount = qualificationCount;
        seasonVisualForm.value.stageOverrides = stageOverrides;
        await loadSeasonStages(id);
        await loadSeasonTeamsForVisualConfig(id);
      } catch (error) {
        seasonVisualForm.value.tags = [];
        seasonVisualForm.value.dateRange = '';
        seasonVisualForm.value.liquipediaTournamentUrl = '';
        liquipediaTournamentUrlError.value = '';
        seasonVisualForm.value.mapIds = [];
        seasonVisualForm.value.standingsTemplate = 'wl_maps';
        seasonVisualForm.value.qualificationCount = 0;
        seasonVisualForm.value.stageOverrides = {};
        await loadSeasonStages(id);
        await loadSeasonTeamsForVisualConfig(id);
      }
    };

    const saveSeasonVisualConfig = async () => {
      if (!seasonVisualForm.value.seasonId) return;
      if (!validateLiquipediaTournamentUrl()) {
        ElMessage.error('请检查 Liquipedia 赛事页面 URL');
        return;
      }
      try {
        const liquipediaTournamentUrl = normalizeLiquipediaTournamentUrl(
          seasonVisualForm.value.liquipediaTournamentUrl
        );
        seasonVisualForm.value.liquipediaTournamentUrl = liquipediaTournamentUrl;
        const value = {
          tags: normalizeStringArray(seasonVisualForm.value.tags),
          dateRange: seasonVisualForm.value.dateRange,
          liquipediaTournamentUrl,
          mapPool: { mapIds: normalizeIdArray(seasonVisualForm.value.mapIds) },
          standings: {
            template: seasonVisualForm.value.standingsTemplate === 'points_3_0' ? 'points_3_0' : 'wl_maps',
            qualificationCount: Number(seasonVisualForm.value.qualificationCount) || 0,
            stageOverrides: (seasonVisualForm.value.stageOverrides && typeof seasonVisualForm.value.stageOverrides === 'object') ? seasonVisualForm.value.stageOverrides : {}
          }
        };
        await apiService.updateConfig({
          key: buildSeasonVisualKey(seasonVisualForm.value.seasonId),
          value,
          description: '赛季可视化配置（Liquipedia赛事页面/标签/地图池/积分榜模板）'
        });
        ElMessage.success('赛季可视化配置已保存');
      } catch (error) {
        console.error('保存赛季可视化配置失败:', error);
        ElMessage.error('保存配置失败');
      }
    };

    const seasonVisualCopySourceId = ref('');
    const activeMapType = ref('');
    const activeSeasonStage = ref('');
    const activeTeamRegion = ref('');
    const activeHeroRole = ref('tank');
    const activeCatalogMapType = ref('');
    const teamSearch = ref('');
    const heroSearch = ref('');
    const mapSearch = ref('');
    const playerSearch = ref('');
    const playerRoleFilter = ref('all');

    const availableVisualCopySeasons = computed(() => {
      const currentSeasonId = Number(seasonVisualForm.value.seasonId);
      return seasons.value.filter(season => Number(season.id) !== currentSeasonId);
    });

    const copySeasonVisualBaseConfig = async () => {
      if (!seasonVisualForm.value.seasonId || !seasonVisualCopySourceId.value) {
        ElMessage.warning('请先选择当前赛季和源赛季');
        return;
      }
      try {
        const config = await apiService.getConfig(buildSeasonVisualKey(seasonVisualCopySourceId.value));
        seasonVisualForm.value.tags = normalizeStringArray(config?.tags);
        seasonVisualForm.value.mapIds = normalizeIdArray(config?.mapPool?.mapIds);
        ElMessage.success('已复制标签和地图池，请点击保存配置完成落库');
      } catch (error) {
        console.error('复制赛季可视化配置失败:', error);
        ElMessage.error('复制失败');
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
    const pendingMediaFile = ref(null);
    const clearMediaOnSave = ref(false);
    const entityContextVisible = ref(false);
    const entityContextType = ref('team');
    const entityContextEntity = ref(null);
    const entityContext = ref(null);
    const entityContextLoading = ref(false);
    

    

    
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

    const heroRules = {
      name: [{ required: true, message: '请输入英雄名称', trigger: 'blur' }],
      role: [{ required: true, message: '请选择职责', trigger: 'change' }]
    };

    const mapRules = {
      name: [{ required: true, message: '请输入地图名称', trigger: 'blur' }],
      type: [{ required: true, message: '请选择地图模式', trigger: 'change' }]
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
    const visualizeSeasonOrderConfig = ref({});
    const seasonOrderSaving = ref(false);

    const sortText = (left, right) => String(left || '').localeCompare(String(right || ''), 'zh-CN', { sensitivity: 'base' });

    const sanitizeSeasonOrderConfig = (rawConfig = {}, seasonList = seasons.value) => {
      const stageToIds = new Map();
      seasonList.forEach(season => {
        const stage = normalizeStageLabel(season.stage);
        if (!stageToIds.has(stage)) {
          stageToIds.set(stage, []);
        }
        stageToIds.get(stage).push(Number(season.id));
      });

      const sanitized = {};
      stageToIds.forEach((ids, stage) => {
        const allowSet = new Set(ids);
        const configured = normalizeIdArray(rawConfig?.[stage]).filter(id => allowSet.has(id));
        const configuredSet = new Set(configured);
        const remaining = ids.filter(id => !configuredSet.has(id));
        sanitized[stage] = configured.concat(remaining);
      });

      return sanitized;
    };

    const getOrderedSeasonsForStage = (stage, seasonList) => {
      const orderIds = sanitizeSeasonOrderConfig(visualizeSeasonOrderConfig.value, seasons.value)[stage] || [];
      const orderMap = new Map(orderIds.map((id, index) => [id, index]));
      return [...seasonList].sort((a, b) => {
        const leftIndex = orderMap.has(Number(a.id)) ? orderMap.get(Number(a.id)) : Number.MAX_SAFE_INTEGER;
        const rightIndex = orderMap.has(Number(b.id)) ? orderMap.get(Number(b.id)) : Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return sortText(a.name, b.name);
      });
    };

    const groupedSeasonList = computed(() => {
      const groups = new Map();
      seasons.value.forEach(season => {
        const stage = normalizeStageLabel(season.stage);
        if (!groups.has(stage)) {
          groups.set(stage, []);
        }
        groups.get(stage).push(season);
      });

      return Array.from(groups.entries()).map(([stage, seasonList]) => ({
        stage,
        seasons: getOrderedSeasonsForStage(stage, seasonList)
      }));
    });

    const currentSeasonGroup = computed(() => {
      return groupedSeasonList.value.find(group => group.stage === activeSeasonStage.value) || groupedSeasonList.value[0] || null;
    });

    const loadVisualizeSeasonOrderConfig = async () => {
      try {
        const config = await apiService.getConfig(VISUALIZE_STAGE_ORDER_KEY);
        visualizeSeasonOrderConfig.value = sanitizeSeasonOrderConfig(config, seasons.value);
      } catch (error) {
        visualizeSeasonOrderConfig.value = sanitizeSeasonOrderConfig({}, seasons.value);
      }
    };

    const moveSeasonOrder = (stage, index, delta) => {
      const group = groupedSeasonList.value.find(item => item.stage === stage);
      if (!group) return;
      const ids = group.seasons.map(season => Number(season.id));
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= ids.length) return;
      const swapped = ids.slice();
      const temp = swapped[index];
      swapped[index] = swapped[nextIndex];
      swapped[nextIndex] = temp;
      visualizeSeasonOrderConfig.value = {
        ...visualizeSeasonOrderConfig.value,
        [stage]: swapped
      };
    };

    const saveVisualizeSeasonOrderConfig = async () => {
      seasonOrderSaving.value = true;
      try {
        const value = sanitizeSeasonOrderConfig(visualizeSeasonOrderConfig.value, seasons.value);
        await apiService.updateConfig({
          key: VISUALIZE_STAGE_ORDER_KEY,
          value,
          description: '可视化页赛段内赛季显示顺序'
        });
        visualizeSeasonOrderConfig.value = value;
        ElMessage.success('可视化赛季顺序已保存');
      } catch (error) {
        console.error('保存赛季顺序配置失败:', error);
        ElMessage.error('保存顺序失败');
      } finally {
        seasonOrderSaving.value = false;
      }
    };

    const groupedTeamsByRegion = computed(() => {
      const groups = new Map();
      teams.value.forEach(team => {
        const label = normalizeRegionLabel(team.region);
        const key = label === UNGROUPED_REGION_LABEL ? '__ungrouped__' : label.toLowerCase();
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label,
            teams: []
          });
        }
        groups.get(key).teams.push(team);
      });

      return Array.from(groups.values())
        .map(group => ({
          ...group,
          teams: [...group.teams].sort((a, b) => sortText(a.name, b.name))
        }))
        .sort((a, b) => {
          if (a.label === UNGROUPED_REGION_LABEL) return 1;
          if (b.label === UNGROUPED_REGION_LABEL) return -1;
          return sortText(a.label, b.label);
        });
    });

    const currentTeamRegionGroup = computed(() => {
      return groupedTeamsByRegion.value.find(group => group.key === activeTeamRegion.value) || groupedTeamsByRegion.value[0] || null;
    });

    watch(groupedSeasonList, (groups) => {
      if (!groups.length) {
        activeSeasonStage.value = '';
        return;
      }
      const exists = groups.some(group => group.stage === activeSeasonStage.value);
      if (!exists) {
        activeSeasonStage.value = groups[0].stage;
      }
    }, { immediate: true });

    watch(groupedTeamsByRegion, (groups) => {
      if (!groups.length) {
        activeTeamRegion.value = '';
        return;
      }
      const exists = groups.some(group => group.key === activeTeamRegion.value);
      if (!exists) {
        activeTeamRegion.value = groups[0].key;
      }
    }, { immediate: true });

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

    const normalizeSearchText = value => String(value || '').trim().toLocaleLowerCase('zh-CN');
    const matchesSearch = (query, values) => {
      const normalized = normalizeSearchText(query);
      if (!normalized) return true;
      return values.some(value => normalizeSearchText(value).includes(normalized));
    };

    const filteredTeamCatalog = computed(() => (currentTeamRegionGroup.value?.teams || [])
      .filter(team => matchesSearch(teamSearch.value, [team.name, team.region, ...(team.aliases || [])])));

    const filteredPlayerCatalog = computed(() => players.value
      .filter(player => playerRoleFilter.value === 'all' || player.role === playerRoleFilter.value)
      .filter(player => matchesSearch(playerSearch.value, [player.name, player.role]))
      .sort((a, b) => sortText(a.name, b.name)));

    const getTeamById = id => teams.value.find(team => Number(team.id) === Number(id)) || null;
    const getPlayerById = id => players.value.find(player => Number(player.id) === Number(id)) || null;
    const identityOriginText = origin => ({
      manual: '手工建立',
      matchweb: 'Matchweb 自动建立',
      sync: '同步建立'
    }[origin] || origin || '来源未记录');

    const getMediaCoverage = (items, field) => {
      const list = Array.isArray(items) ? items : [];
      return `${list.filter(item => String(item?.[field] || '').trim()).length}/${list.length}`;
    };

    const groupedHeroesForManagement = computed(() => ['tank', 'damage', 'support']
      .map(role => ({
        role,
        heroes: heroes.value
          .filter(hero => hero.role === role)
          .sort((a, b) => sortText(a.name, b.name))
      }))
      .filter(group => group.heroes.length > 0));

    const currentHeroRoleGroup = computed(() => groupedHeroesForManagement.value
      .find(group => group.role === activeHeroRole.value) || groupedHeroesForManagement.value[0] || null);

    const filteredHeroCatalog = computed(() => (currentHeroRoleGroup.value?.heroes || [])
      .filter(hero => matchesSearch(heroSearch.value, [hero.name, hero.subRole, hero.role])));

    const groupedMapsForSelect = computed(() => {
      const grouped = new Map(MAP_TYPE_ORDER.map(type => [type, []]));
      maps.value.forEach(map => {
        const type = String(map.type || '').trim();
        if (!grouped.has(type)) {
          grouped.set(type, []);
        }
        grouped.get(type).push(map);
      });

      return Array.from(grouped.entries())
        .map(([type, list]) => ({
          type,
          label: type,
          maps: [...list].sort((a, b) => sortText(a.name, b.name))
        }))
        .filter(group => group.maps.length > 0);
    });

    const groupedMapsForManagement = groupedMapsForSelect;
    const currentMapTypeGroup = computed(() => groupedMapsForManagement.value
      .find(group => group.type === activeCatalogMapType.value) || groupedMapsForManagement.value[0] || null);

    const filteredMapCatalog = computed(() => (currentMapTypeGroup.value?.maps || [])
      .filter(map => matchesSearch(mapSearch.value, [map.name, map.type])));

    const availableSeasonTeamCatalog = computed(() => {
      const existingIds = new Set(seasonTeams.value.map(row => Number(row.teamId)));
      return teams.value
        .filter(team => !existingIds.has(Number(team.id)))
        .sort((a, b) => sortText(a.name, b.name));
    });

    const rosterCandidateGroups = computed(() => {
      const existingIds = new Set(seasonTeamPlayers.value.map(row => Number(row.playerId)));
      return ['tank', 'damage', 'support'].map(role => ({
        role,
        players: players.value
          .filter(player => player.role === role && !existingIds.has(Number(player.id)))
          .sort((a, b) => sortText(a.name, b.name))
      })).filter(group => group.players.length);
    });

    const selectedRosterTeamName = computed(() => {
      const relation = seasonTeams.value.find(row => Number(row.id) === Number(seasonTeamPlayerFilter.value.seasonTeamId));
      return relation ? getTeamName(relation.teamId) : '未选择队伍';
    });

    const rosterPlayersByRole = role => seasonTeamPlayers.value
      .filter(row => (row.Player || getPlayerById(row.playerId))?.role === role)
      .sort((a, b) => sortText(a.Player?.name || getPlayerName(a.playerId), b.Player?.name || getPlayerName(b.playerId)));

    watch(groupedHeroesForManagement, groups => {
      if (!groups.some(group => group.role === activeHeroRole.value)) {
        activeHeroRole.value = groups[0]?.role || 'tank';
      }
    }, { immediate: true });

    watch(groupedMapsForManagement, groups => {
      if (!groups.some(group => group.type === activeCatalogMapType.value)) {
        activeCatalogMapType.value = groups[0]?.type || '';
      }
    }, { immediate: true });

    const handleMapPoolDropdownVisible = (visible) => {
      if (!visible) return;
      if (!groupedMapsForSelect.value.length) {
        activeMapType.value = '';
        return;
      }
      const currentTypeExists = groupedMapsForSelect.value.some(group => group.type === activeMapType.value);
      if (!currentTypeExists) {
        activeMapType.value = groupedMapsForSelect.value[0].type;
      }
    };

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
            editorKey: `stat-${stat.id || `${teamId}-${stat.playerId || Math.random()}`}`,
            role: player ? (player.role === 'tank' ? 'tank' : player.role === 'damage' ? 'damage' : 'support') : 'tank',
            kad: `${stat.kills || 0}/${stat.assists || 0}/${stat.deaths || 0}`,
            finalBlows: stat.finalBlows || 0,
            ultsUsed: stat.ultsUsed || 0,
            heroStats: (Array.isArray(stat.heroStats) ? stat.heroStats : []).map(heroStat => ({
              ...heroStat,
              editorKey: `hero-stat-${heroStat.id || Math.random()}`
            }))
          };
        });

      while (teamStats.length < 5) {
        teamStats.push({
          editorKey: `new-stat-${teamId}-${teamStats.length}-${Date.now()}`,
          playerId: '',
          role: 'tank',
          kad: '',
          damage: 0,
          healing: 0,
          mitigation: 0,
          finalBlows: 0,
          ultsUsed: 0,
          heroStats: [],
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
      seasonTeamAddIds.value = [];
      
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
      rosterAddPlayerIds.value = [];
      
      if (seasonTeamPlayerFilter.value.seasonTeamId) {
        try {
          await store.dispatch('getSeasonTeamPlayers', seasonTeamPlayerFilter.value.seasonTeamId);
        } catch (error) {
          ElMessage.error('加载赛季-队伍-选手关联失败: ' + error.message);
        }
      }
    };
    
    // 加载赛季队伍用于选手关联
    const loadSeasonTeamsForPlayers = async (preserveSelection = false) => {
      // 先清空列表，避免显示旧数据
      const previousSeasonTeamId = preserveSelection === true
        ? seasonTeamPlayerFilter.value.seasonTeamId
        : '';
      store.commit('setSeasonTeams', []);
      store.commit('setSeasonTeamPlayers', []);
      
      if (seasonTeamPlayerFilter.value.seasonId) {
        try {
          const seasonId = seasonTeamPlayerFilter.value.seasonId;
           const allSeasonTeams = await apiService.getAllSeasonTeams();
           const filteredSeasonTeams = allSeasonTeams.filter(st => st.seasonId === seasonId);
           store.commit('setSeasonTeams', filteredSeasonTeams);
           const selectionExists = filteredSeasonTeams.some(row => Number(row.id) === Number(previousSeasonTeamId));
           seasonTeamPlayerFilter.value.seasonTeamId = selectionExists ? previousSeasonTeamId : '';
           if (selectionExists) await loadSeasonTeamPlayers();
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
        editorKey: `new-stat-${teamId}-${Date.now()}-${statsArray.length}`,
        playerId: '',
        role: 'tank',
        kad: '',
        damage: 0,
        healing: 0,
        mitigation: 0,
        finalBlows: 0,
        ultsUsed: 0,
        heroStats: [],
        teamId: teamId
      });
    };

    const clearStatRow = (stat) => {
      stat.playerId = '';
      stat.kad = '';
      stat.damage = 0;
      stat.healing = 0;
      stat.mitigation = 0;
      stat.finalBlows = 0;
      stat.ultsUsed = 0;
      stat.heroStats = [];
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
                finalBlows: ps.finalBlows || 0,
                heroStats: (Array.isArray(ps.heroStats) ? ps.heroStats : [])
                  .filter(heroStat => heroStat.heroId || heroStat.heroName)
                  .map(heroStat => ({
                    heroId: heroStat.heroId || null,
                    heroName: heroStat.heroName || getHeroName(heroStat.heroId),
                    usageSeconds: Number(heroStat.usageSeconds) || 0,
                    usagePercentage: Number(heroStat.usagePercentage) || 0,
                    finalBlows: Number(heroStat.finalBlows) || 0,
                    deathsByFinalBlow: Number(heroStat.deathsByFinalBlow) || 0,
                    ultReady: Number(heroStat.ultReady) || 0,
                    ultUsed: Number(heroStat.ultUsed) || 0,
                    avgUltChargeSeconds: heroStat.avgUltChargeSeconds === null || heroStat.avgUltChargeSeconds === ''
                      ? null
                      : Number(heroStat.avgUltChargeSeconds) || 0
                  }))
              };
            });
          
          await apiService.updateMapGame(mapGame.id, {
            mapId: mapGame.mapId,
            winnerId: mapGame.winnerId,
            team1BanHeroId: mapGame.team1BanHeroId,
            team2BanHeroId: mapGame.team2BanHeroId,
            duration: mapGame.duration,
            team1Score: mapGame.team1Score,
            team2Score: mapGame.team2Score,
            replayId: mapGame.replayId || null,
            statsVersion: mapGame.statsVersion || 1,
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
      resetMediaDraft();
      dialogTitle.value = '添加赛季';
      dialogType.value = 'season';
      editForm.value = {
        name: '',
        stage: '',
        status: 'in_progress',
        icon: ''
      };
      dialogVisible.value = true;
    };
    
    // 编辑赛季
    const editSeason = (season) => {
      resetMediaDraft();
      dialogTitle.value = '编辑赛季';
      dialogType.value = 'season';
      // 深拷贝赛季数据
      editForm.value = JSON.parse(JSON.stringify(season));
      dialogVisible.value = true;
    };
    
    // 添加队伍
    const addTeam = () => {
      resetMediaDraft();
      dialogTitle.value = '添加队伍';
      dialogType.value = 'team';
      editForm.value = {
        name: '',
        region: '',
        logo: '',
        aliases: []
      };
      dialogVisible.value = true;
    };
    
    // 编辑队伍
    const editTeam = (team) => {
      resetMediaDraft();
      dialogTitle.value = '编辑队伍';
      dialogType.value = 'team';
      // 深拷贝队伍数据
      editForm.value = {
        ...JSON.parse(JSON.stringify(team)),
        aliases: Array.isArray(team.aliases) ? [...team.aliases] : []
      };
      dialogVisible.value = true;
    };

    const membershipSourceLabel = sourceType => ({
      manual: '手工配置',
      match: '比赛出场',
      owtv: 'OWTV',
      liquipedia: 'Liquipedia',
      legacy: '旧数据待确认'
    }[sourceType] || sourceType);

    const membershipSourceTagType = sourceType => ({
      manual: 'primary',
      match: 'success',
      owtv: 'warning',
      liquipedia: 'warning',
      legacy: 'info'
    }[sourceType] || 'info');

    const membershipSourceTypes = row => [
      ...new Set((row?.sources || []).map(source => source.sourceType).filter(Boolean))
    ];

    const openMatchweb = () => {
      window.open('https://match.owmini.xyz/admin.html', '_blank', 'noopener,noreferrer');
    };

    const loadEntityContext = async (type, entity) => {
      if (!entity?.id) return;
      entityContextType.value = type;
      entityContextEntity.value = entity;
      entityContext.value = null;
      entityContextVisible.value = true;
      entityContextLoading.value = true;
      try {
        entityContext.value = type === 'team'
          ? await apiService.getTeamAdminContext(entity.id)
          : await apiService.getPlayerAdminContext(entity.id);
        entityContextEntity.value = entityContext.value?.entity || entity;
      } catch (error) {
        ElMessage.error('加载历史上下文失败: ' + (error.response?.data?.error || error.message));
      } finally {
        entityContextLoading.value = false;
      }
    };

    const openTeamContext = team => loadEntityContext('team', team);
    const openPlayerContext = player => loadEntityContext('player', player);
    const editContextEntity = () => {
      const entity = entityContextEntity.value;
      if (!entity) return;
      if (entityContextType.value === 'team') editTeam(entity);
      else editPlayer(entity);
    };

    const addHero = () => {
      resetMediaDraft();
      dialogTitle.value = '添加英雄';
      dialogType.value = 'hero';
      editForm.value = { name: '', role: activeHeroRole.value || 'tank', subRole: '', image: '' };
      dialogVisible.value = true;
    };

    const editHero = hero => {
      resetMediaDraft();
      dialogTitle.value = '编辑英雄';
      dialogType.value = 'hero';
      editForm.value = JSON.parse(JSON.stringify(hero));
      dialogVisible.value = true;
    };

    const addMap = () => {
      resetMediaDraft();
      dialogTitle.value = '添加地图';
      dialogType.value = 'map';
      editForm.value = { name: '', type: activeCatalogMapType.value || MAP_TYPE_ORDER[0], image: '' };
      dialogVisible.value = true;
    };

    const editMap = map => {
      resetMediaDraft();
      dialogTitle.value = '编辑地图';
      dialogType.value = 'map';
      editForm.value = JSON.parse(JSON.stringify(map));
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

    const addSeasonTeamsInline = async () => {
      if (!seasonTeamFilter.value.seasonId || !seasonTeamAddIds.value.length) return;
      relationSaving.value = true;
      try {
        const result = await store.dispatch('bulkCreateSeasonTeams', {
          seasonId: seasonTeamFilter.value.seasonId,
          teamIds: seasonTeamAddIds.value
        });
        seasonTeamAddIds.value = [];
        await loadSeasonTeams();
        ElMessage.success(result?.message || '参赛队伍已加入');
      } catch (error) {
        ElMessage.error('加入失败: ' + (error.response?.data?.error || error.message));
      } finally {
        relationSaving.value = false;
      }
    };

    const addRosterPlayersInline = async () => {
      if (!seasonTeamPlayerFilter.value.seasonTeamId || !rosterAddPlayerIds.value.length) return;
      relationSaving.value = true;
      try {
        const result = await store.dispatch('bulkCreateSeasonTeamPlayers', {
          seasonTeamId: seasonTeamPlayerFilter.value.seasonTeamId,
          playerIds: rosterAddPlayerIds.value
        });
        rosterAddPlayerIds.value = [];
        await loadSeasonTeamPlayers();
        ElMessage.success(result?.message || '阵容成员已加入');
      } catch (error) {
        ElMessage.error('加入失败: ' + (error.response?.data?.error || error.message));
      } finally {
        relationSaving.value = false;
      }
    };

    const manageSeasonTeamRoster = async relation => {
      seasonTeamPlayerFilter.value.seasonId = relation.seasonId;
      seasonTeamPlayerFilter.value.seasonTeamId = relation.id;
      await router.push('/data-manage/season-team-players');
      await loadSeasonTeamsForPlayers(true);
    };

    const resetMediaDraft = () => {
      pendingMediaFile.value = null;
      clearMediaOnSave.value = false;
    };

    const handleMediaFileChange = file => {
      pendingMediaFile.value = file || null;
      if (file) clearMediaOnSave.value = false;
    };

    const handleMediaClear = () => {
      pendingMediaFile.value = null;
      clearMediaOnSave.value = true;
      if (dialogType.value === 'season') editForm.value.icon = '';
      if (dialogType.value === 'team') editForm.value.logo = '';
      if (dialogType.value === 'hero' || dialogType.value === 'map') editForm.value.image = '';
    };

    const catalogMediaConfig = {
      season: {
        category: 'seasons',
        imageField: 'icon',
        createAction: 'createSeason',
        updateAction: 'updateSeason',
        dataKey: 'seasonData',
        label: '赛季'
      },
      team: {
        category: 'teams',
        imageField: 'logo',
        createAction: 'createTeam',
        updateAction: 'updateTeam',
        dataKey: 'teamData',
        label: '队伍'
      },
      hero: {
        category: 'heroes',
        imageField: 'image',
        createAction: 'createHero',
        updateAction: 'updateHero',
        dataKey: 'heroData',
        label: '英雄'
      },
      map: {
        category: 'maps',
        imageField: 'image',
        createAction: 'createMap',
        updateAction: 'updateMap',
        dataKey: 'mapData',
        label: '地图'
      }
    };

    const saveCatalogEntity = async type => {
      const config = catalogMediaConfig[type];
      const payload = { ...editForm.value };
      delete payload[config.imageField];

      let entity;
      if (editForm.value.id) {
        entity = await store.dispatch(config.updateAction, {
          id: editForm.value.id,
          [config.dataKey]: payload
        });
      } else {
        entity = await store.dispatch(config.createAction, payload);
        editForm.value.id = entity.id;
      }

      const entityId = entity?.id || editForm.value.id;
      if (pendingMediaFile.value) {
        await apiService.uploadMedia(config.category, entityId, pendingMediaFile.value);
      } else if (clearMediaOnSave.value) {
        await apiService.clearMedia(config.category, entityId);
      }

      await store.dispatch('loadBaseData');
      resetMediaDraft();
      ElMessage.success(`${config.label}数据保存成功`);
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
                await saveCatalogEntity('season');
                break;
              case 'team':
                await saveCatalogEntity('team');
                break;
              case 'hero':
                await saveCatalogEntity('hero');
                break;
              case 'map':
                await saveCatalogEntity('map');
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
            ElMessage.error('操作失败: ' + (error.response?.data?.error || error.message));
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
        if (checkResult.blocked) {
          ElMessage.warning(
            `该赛季仍有 ${checkResult.matchesCount} 场比赛、${checkResult.mapGamesCount} 局地图数据，` +
            '请先在 Matchweb 删除并完成同步。Stats 不允许级联删除比赛。'
          );
          return;
        }
        
        // 2. 构建提示信息
        const message = `
          <p>确定要删除该赛季配置吗？此操作将<strong>不可恢复</strong>。</p>
          <p>将删除以下非比赛配置：</p>
          <ul style="text-align: left; margin-left: 20px;">
            <li>参赛队伍：${checkResult.seasonTeamsCount} 支</li>
            <li>队伍成员记录：${checkResult.seasonTeamPlayersCount} 条</li>
          </ul>
        `;

        await ElMessageBox.confirm(message, '删除赛季配置', {
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          type: 'warning',
          dangerouslyUseHTMLString: true,
          confirmButtonClass: 'el-button--danger'
        });
        
        await store.dispatch('deleteSeason', id);
        ElMessage.success('赛季配置删除成功');
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
          ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message));
        }
      }
    };

    const deleteHero = async id => {
      try {
        await ElMessageBox.confirm('确定要删除这个英雄吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        await store.dispatch('deleteHero', id);
        ElMessage.success('英雄删除成功');
        await store.dispatch('loadBaseData');
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message));
        }
      }
    };

    const deleteMap = async id => {
      try {
        await ElMessageBox.confirm('确定要删除这张地图吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        await store.dispatch('deleteMap', id);
        ElMessage.success('地图删除成功');
        await store.dispatch('loadBaseData');
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message));
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
        
        const result = await store.dispatch('deleteSeasonTeam', id);
        ElMessage.success(result?.message || '赛季-队伍关联删除成功');
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
        
        const result = await store.dispatch('deleteSeasonTeamPlayer', id);
        ElMessage.success(result?.message || '赛季-队伍-选手关联删除成功');
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
      await loadVisualizeSeasonOrderConfig();
      loadMatches();
      loadChartConfig();
      
      window.addEventListener('resize', updateIsMobile);
    });
    
    return {
      pageTitleMap,
      pageSectionMap,
      pageDescriptionMap,
      activeTab,
      syncing,
      syncExternalMatches,
      filterForm,
      matchFilterTeams,
      seasonTeamFilter,
      seasonTeamPlayerFilter,
      seasonTeamAddIds,
      rosterAddPlayerIds,
      relationSaving,
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
      heroRules,
      mapRules,
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
      membershipSourceLabel,
      membershipSourceTagType,
      membershipSourceTypes,
      openMatchweb,
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
      addHero,
      editHero,
      addMap,
      editMap,
      addPlayer,
      editPlayer,
      addSeasonTeam,
      addSeasonTeamPlayer,
      saveEdit,
      saveMapGameEdit,
      resetMapGameEditForm,
      deleteSeason,
      deleteTeam,
      deleteHero,
      deleteMap,
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
      liquipediaTournamentUrlError,
      validateLiquipediaTournamentUrl,
      seasonVisualCopySourceId,
      activeMapType,
      availableVisualCopySeasons,
      loadSeasonVisualConfig,
      saveSeasonVisualConfig,
      copySeasonVisualBaseConfig,
      seasonStages,
      seasonStageMatches,
      stageDraft,
      stageSaving,
      formatStageMatchLabel,
      formatStageRange,
      createStage,
      updateStage,
      deleteStage,
      stageSegments,
      seasonVisualTeams,
      getStageOverride,
      handleOrderedTeamIdsChange,
      moveOrderedTeam,
      removeOrderedTeam,
      groupedMapsForSelect,
      handleMapPoolDropdownVisible,
      groupedSeasonList,
      currentSeasonGroup,
      activeSeasonStage,
      groupedTeamsByRegion,
      currentTeamRegionGroup,
      activeTeamRegion,
      teamSearch,
      filteredTeamCatalog,
      groupedHeroesForManagement,
      currentHeroRoleGroup,
      activeHeroRole,
      heroSearch,
      filteredHeroCatalog,
      groupedMapsForManagement,
      currentMapTypeGroup,
      activeCatalogMapType,
      mapSearch,
      filteredMapCatalog,
      playerSearch,
      playerRoleFilter,
      filteredPlayerCatalog,
      getTeamById,
      getPlayerById,
      identityOriginText,
      availableSeasonTeamCatalog,
      rosterCandidateGroups,
      selectedRosterTeamName,
      rosterPlayersByRole,
      addSeasonTeamsInline,
      addRosterPlayersInline,
      manageSeasonTeamRoster,
      entityContextVisible,
      entityContextType,
      entityContextEntity,
      entityContext,
      entityContextLoading,
      openTeamContext,
      openPlayerContext,
      editContextEntity,
      MAP_TYPE_ORDER,
      getMediaCoverage,
      mediaSourceState,
      resolveMediaUrl,
      handleMediaFileChange,
      handleMediaClear,
      moveSeasonOrder,
      saveVisualizeSeasonOrderConfig,
      seasonOrderSaving,

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
.entity-workspace,
.relation-workspace {
  overflow: hidden;
  border: 1px solid #dfe2e6;
  border-radius: 12px;
  background: #fff;
}

.entity-toolbar,
.relation-commandbar,
.roster-addbar {
  display: grid;
  grid-template-columns: minmax(210px, 1fr) minmax(280px, 420px) auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #e7e9ec;
  background: #fff;
}

.entity-toolbar-title,
.relation-commandbar > div:first-child,
.roster-addbar > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.entity-toolbar-title strong,
.relation-commandbar > div:first-child strong,
.roster-addbar > div:first-child strong {
  color: #17181a;
  font-family: 'Oxanium', sans-serif;
  font-size: 15px;
  font-weight: 800;
}

.entity-toolbar-title span,
.relation-commandbar > div:first-child span,
.roster-addbar > div:first-child span {
  color: #7a7f87;
  font-size: 11px;
}

.entity-search {
  width: 100%;
}

.entity-filter-strip {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  border-bottom: 1px solid #e7e9ec;
  background: #f7f8f9;
}

.entity-filter-strip button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 11px;
  flex: 0 0 auto;
  border: 1px solid transparent;
  border-radius: 7px;
  color: #61666d;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}

.entity-filter-strip button:hover {
  color: #17181a;
  background: #fff;
}

.entity-filter-strip button.active {
  border-color: #ffb17b;
  color: #9d4100;
  background: #fff0e6;
}

.entity-filter-strip button span {
  display: inline-grid;
  place-items: center;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  border-radius: 999px;
  color: #73777e;
  background: rgba(0, 0, 0, .055);
  font-size: 10px;
}

.entity-card-grid {
  display: grid;
  gap: 1px;
  background: #e7e9ec;
}

.entity-card-grid--teams,
.entity-card-grid--players {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.entity-card-grid--catalog {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.entity-card-grid--maps {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.entity-card {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 92px;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 11px;
  align-items: center;
  padding: 11px;
  color: #2d3034;
  background: #fff;
  cursor: pointer;
  transition: background-color 160ms ease, box-shadow 160ms ease;
}

.entity-card:hover {
  z-index: 1;
  background: #fffaf6;
  box-shadow: inset 3px 0 0 #ff6a00;
}

.entity-thumb {
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  overflow: hidden;
  border: 1px solid #e1e3e6;
  border-radius: 10px;
  color: #8a8f96;
  background:
    linear-gradient(45deg, #f2f3f4 25%, transparent 25%),
    linear-gradient(-45deg, #f2f3f4 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #f2f3f4 75%),
    linear-gradient(-45deg, transparent 75%, #f2f3f4 75%), #fff;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
  font: 800 12px/1 'Oxanium', sans-serif;
}

.entity-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.season-icon-cell {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  overflow: hidden;
  border: 1px solid #e1e3e6;
  border-radius: 8px;
  background: #f7f8f9;
}

.season-icon-cell img {
  width: 100%;
  height: 100%;
  padding: 4px;
  box-sizing: border-box;
  object-fit: contain;
}

.season-icon-cell.is-empty {
  color: #a5a9af;
}

.entity-thumb--logo img {
  padding: 6px;
}

.entity-thumb--hero img {
  object-fit: cover;
}

.entity-thumb--map {
  width: 108px;
}

.entity-thumb--map img {
  object-fit: cover;
}

.map-card {
  grid-template-columns: 108px minmax(0, 1fr);
}

.entity-card-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.entity-card-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.entity-card-heading strong {
  overflow: hidden;
  color: #1d1f22;
  font-family: 'Oxanium', sans-serif;
  font-size: 14px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-card-heading span,
.entity-card-copy small,
.entity-card-muted {
  flex: 0 0 auto;
  color: #838890;
  font-size: 10px;
  font-style: normal;
}

.entity-card-tags {
  display: flex;
  min-width: 0;
  gap: 4px;
  overflow: hidden;
}

.entity-card-tags span {
  max-width: 90px;
  padding: 3px 6px;
  overflow: hidden;
  border-radius: 5px;
  color: #8a3b00;
  background: #fff0e7;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-card-actions {
  position: absolute;
  right: 8px;
  bottom: 7px;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 140ms ease;
}

.entity-card:hover .entity-card-actions,
.entity-card:focus-within .entity-card-actions {
  opacity: 1;
}

.entity-card-actions button,
.relation-card-actions button,
.roster-player-row > button {
  min-height: 27px;
  padding: 0 7px;
  border: 0;
  border-radius: 5px;
  color: #565b62;
  background: #f1f2f4;
  cursor: pointer;
  font-size: 10px;
}

.entity-card-actions button:hover,
.relation-card-actions button:hover,
.roster-player-row > button:hover {
  color: #9d4100;
  background: #ffe9d9;
}

.entity-card-actions button.danger:hover,
.relation-card-actions button.danger:hover,
.roster-player-row > button.danger:hover {
  color: #b42318;
  background: #feeceb;
}

.player-card {
  grid-template-columns: 48px minmax(0, 1fr);
  min-height: 75px;
}

.player-card.is-orphan {
  background: #fffbf3;
}

.player-monogram {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, #292b2f, #575b62);
  font: 750 11px/1 'Oxanium', sans-serif;
}

.player-monogram.small {
  width: 34px;
  height: 34px;
  font-size: 9px;
}

.relation-commandbar {
  grid-template-columns: minmax(230px, 1fr) minmax(210px, 300px) minmax(280px, 460px) auto;
}

.relation-commandbar.roster-commandbar {
  grid-template-columns: minmax(280px, 1fr) minmax(220px, 340px) minmax(220px, 340px);
}

.relation-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  background: #f3f4f5;
}

.relation-card {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 72px;
  gap: 11px;
  align-items: center;
  min-height: 92px;
  padding: 11px;
  border: 1px solid #dfe2e6;
  border-radius: 10px;
  background: #fff;
}

.relation-team-logo {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border: 1px solid #e1e3e6;
  border-radius: 9px;
  color: #747981;
  background: #fafafa;
  font: 800 10px/1 'Oxanium', sans-serif;
}

.relation-team-logo img { width: 100%; height: 100%; padding: 5px; object-fit: contain; }
.relation-card-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.relation-card-copy > strong { overflow: hidden; color: #1f2124; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.relation-card-copy > span { color: #858a92; font-size: 10px; }
.relation-sources { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.relation-sources em { padding: 2px 5px; border-radius: 4px; color: #5a5f66; background: #eef0f2; font-size: 9px; font-style: normal; }
.relation-card-count { display: flex; flex-direction: column; align-items: flex-end; }
.relation-card-count strong { color: #d95700; font: 800 21px/1 'Oxanium', sans-serif; }
.relation-card-count span { color: #8a8f96; font-size: 9px; }
.relation-card-actions { display: flex; grid-column: 2 / -1; justify-content: flex-end; gap: 4px; padding-top: 7px; border-top: 1px dashed #e0e2e5; }

.roster-addbar {
  grid-template-columns: minmax(210px, 1fr) minmax(360px, 2fr) auto;
  background: #fafafa;
}

.roster-role-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  background: #e2e4e7;
}

.roster-role-column {
  min-width: 0;
  padding: 12px;
  background: #f7f8f9;
}

.roster-role-column > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.roster-role-column > header strong { color: #34373b; font-size: 12px; }
.roster-role-column > header span { display: grid; place-items: center; min-width: 20px; height: 20px; border-radius: 999px; color: #8a3b00; background: #ffe9da; font-size: 10px; }

.roster-player-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  padding: 8px;
  border: 1px solid #e1e3e6;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.roster-player-row > div:nth-child(2) { display: flex; min-width: 0; flex-direction: column; }
.roster-player-row > div:nth-child(2) > strong { overflow: hidden; color: #2c2f33; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.roster-player-row > button { opacity: 0; }
.roster-player-row:hover > button,
.roster-player-row:focus-within > button { opacity: 1; }
.roster-empty { padding: 26px 8px; border: 1px dashed #d6d9dd; border-radius: 8px; color: #92969d; text-align: center; font-size: 11px; }

@media (max-width: 1320px) {
  .entity-card-grid--teams,
  .entity-card-grid--players,
  .entity-card-grid--maps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .entity-card-grid--catalog { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .relation-commandbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .entity-toolbar,
  .relation-commandbar,
  .relation-commandbar.roster-commandbar,
  .roster-addbar { grid-template-columns: 1fr; }
  .entity-card-grid--teams,
  .entity-card-grid--players,
  .entity-card-grid--maps,
  .relation-card-grid { grid-template-columns: 1fr; }
  .entity-card-grid--catalog { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .roster-role-grid { grid-template-columns: 1fr; }
  .entity-card-actions,
  .roster-player-row > button { position: static; opacity: 1; }
  .entity-card-actions { grid-column: 1 / -1; }
}

@media (max-width: 520px) {
  .entity-card-grid--catalog { grid-template-columns: 1fr; }
  .entity-card { min-height: 84px; }
  .entity-card-actions button,
  .relation-card-actions button,
  .roster-player-row > button { min-height: 42px; padding: 0 11px; }
  .relation-card { grid-template-columns: 44px minmax(0, 1fr); }
  .relation-card-count { grid-column: 2; align-items: flex-start; }
  .relation-card-actions { grid-column: 1 / -1; }
}

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

.visual-copy-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.form-hint {
  margin-top: 8px;
  color: #888;
  font-size: 12px;
  line-height: 1.5;
}

.team-identity-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  padding: 4px 0;
}

.team-primary-name {
  color: #f5f5f5;
  font-family: 'Oxanium', sans-serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.team-alias-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.team-alias-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 8px;
  border: 1px solid #4a4022;
  border-radius: 999px;
  background: #211e15;
  color: #e5c85c;
  font-family: 'Oxanium', sans-serif;
  font-size: 11px;
  line-height: 1;
}

.team-alias-empty {
  color: #737373;
  font-size: 11px;
}

.team-alias-editor,
.team-alias-hint {
  width: 100%;
}

.map-type-tabs-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px 12px;
  border-bottom: 1px solid #2a2a2a;
  margin-bottom: 4px;
  background: #181818;
  position: sticky;
  top: 0;
  z-index: 1;
}

.map-type-tab {
  border: 1px solid #3a3a3a;
  background: #111;
  color: #cfcfcf;
  padding: 6px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: all 0.2s ease;
}

.map-type-tab:hover {
  border-color: #facc15;
  color: #fff;
}

.map-type-tab.active {
  background: #facc15;
  border-color: #facc15;
  color: #111;
  font-weight: 600;
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

.stage-manager {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.stage-manager-hint {
  margin: 0;
}

.stage-create-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(300px, 1.5fr) auto;
  gap: 10px;
  align-items: center;
}

.stage-first-tip,
.stage-season-start {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  color: #a3a3a3;
  background: #202020;
  border: 1px solid #3a3a3a;
  border-radius: 3px;
}

.stage-definition-list {
  display: flex;
  flex-direction: column;
  border: 1px solid #333;
  background: #181818;
}

.stage-definition-row {
  display: grid;
  grid-template-columns: 30px minmax(150px, 0.65fr) minmax(280px, 1.35fr) minmax(260px, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #303030;
}

.stage-definition-row:last-child {
  border-bottom: 0;
}

.stage-definition-index {
  color: #f59e0b;
  font-family: 'Orbitron', sans-serif;
  font-weight: 700;
  text-align: center;
}

.stage-name-input,
.stage-match-select {
  width: 100%;
}

.stage-range-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #a3a3a3;
  font-size: 12px;
}

.stage-range-summary > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-definition-actions {
  display: flex;
  gap: 6px;
}

@media (max-width: 1100px) {
  .stage-create-row,
  .stage-definition-row {
    grid-template-columns: 30px 1fr;
  }

  .stage-create-row > * {
    grid-column: 1 / -1;
  }

  .stage-definition-row > :not(.stage-definition-index) {
    grid-column: 2;
  }
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

.grouped-section-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
}

.management-tabs-header {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 20px 24px 12px;
}

.header-title-with-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}

.asset-coverage {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid #3b3b3b;
  border-radius: 999px;
  color: #a3a3a3;
  font-size: 12px;
  font-weight: 500;
}

.asset-cell {
  display: grid;
  place-items: center;
  margin: 4px auto;
  overflow: hidden;
  border: 1px solid #343434;
  background: #151515;
  color: #737373;
  font-size: 11px;
}

.asset-cell img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.asset-cell--logo,
.asset-cell--hero {
  width: 68px;
  height: 58px;
}

.asset-cell--map {
  width: 132px;
  height: 70px;
}

.asset-cell--map img {
  object-fit: cover;
}

.management-tabs-inline {
  padding: 0;
  flex: 1;
}

.management-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #3a3a3a;
  background: #111;
  color: #d4d4d4;
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  transition: all 0.2s ease;
}

.management-tab:hover {
  border-color: #facc15;
  color: #fff;
}

.management-tab.active {
  background: #facc15;
  border-color: #facc15;
  color: #111;
  font-weight: 600;
}

.management-tab-count {
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.management-tab.active .management-tab-count {
  background: rgba(0, 0, 0, 0.12);
}

.inline-order-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.grouped-section-list :deep(.el-table) {
  margin-top: 0;
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
.player-editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  margin-top: 16px;
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
