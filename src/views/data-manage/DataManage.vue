<template>
  <div class="data-manage-container">
    <h2 class="page-title">数据管理</h2>

    <!-- 管理标签页 -->
    <el-card class="nav-card">
      <el-tabs v-model="activeTab" @tab-click="handleTabClick">
        <el-tab-pane label="比赛管理" name="matches">
          <el-icon><Calendar /></el-icon>
          比赛管理
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
      </el-tabs>
    </el-card>

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
        <el-form-item label="获胜队伍">
          <el-select v-model="filterForm.winnerId" placeholder="请选择获胜队伍" style="width: 180px">
            <el-option
              v-for="team in teams"
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
      <el-card class="data-card" style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>比赛列表</span>
            <el-button type="primary" size="small" @click="addMatch">
              <el-icon><Plus /></el-icon>
              添加比赛
            </el-button>
            <el-button type="danger" size="small" @click="deleteSelectedMatches" :disabled="selectedMatches.length === 0">
              <el-icon><Delete /></el-icon>
              批量删除
            </el-button>
          </div>
        </template>
        <el-table
          v-loading="loading"
          :data="matches"
          style="width: 100%"
          @selection-change="handleSelectionChange"
          border
        >
          <el-table-column type="selection" width="55" />
          <el-table-column prop="id" label="比赛ID" width="80" />
          <el-table-column prop="matchDate" label="比赛日期" width="120">
            <template #default="scope">
              {{ formatDate(scope.row.matchDate) }}
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
                <span :class="{ winner: scope.row.winnerId === scope.row.team1Id }">{{ getTeamName(scope.row.team1Id) }}</span>
                <span class="vs">VS</span>
                <span :class="{ winner: scope.row.winnerId === scope.row.team2Id }">{{ getTeamName(scope.row.team2Id) }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="mapGamesCount" label="地图局数" width="100">
            <template #default="scope">
              {{ scope.row.mapGamesCount || 0 }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="scope">
              <el-button type="info" size="small" @click="viewMatch(scope.row)">
                <el-icon><View /></el-icon>
                查看
              </el-button>
              <el-button type="primary" size="small" @click="editMatch(scope.row)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button type="danger" size="small" @click="deleteMatch(scope.row.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
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
          <el-table-column prop="id" label="赛季ID" width="80" />
          <el-table-column prop="name" label="赛季名称" width="200" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.status === 'in_progress' ? 'success' : 'info'">
                {{ scope.row.status === 'in_progress' ? '进行中' : '已完成' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="scope">
              <el-button type="primary" size="small" @click="editSeason(scope.row)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button type="danger" size="small" @click="deleteSeason(scope.row.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
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
          <el-table-column prop="id" label="队伍ID" width="80" />
          <el-table-column prop="name" label="队伍名称" width="200" />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="scope">
              <el-button type="primary" size="small" @click="editTeam(scope.row)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button type="danger" size="small" @click="deleteTeam(scope.row.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 选手管理 -->
    <div v-show="activeTab === 'players'">
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>选手列表</span>
            <el-button type="primary" size="small" @click="addPlayer">
              <el-icon><Plus /></el-icon>
              添加选手
            </el-button>
          </div>
        </template>
        <el-table
          v-loading="loading"
          :data="players"
          style="width: 100%"
          border
        >
          <el-table-column prop="id" label="选手ID" width="80" />
          <el-table-column prop="name" label="选手名称" width="150" />
          <el-table-column prop="role" label="位置" width="100">
            <template #default="scope">
              <el-tag :type="getRoleType(scope.row.role)">
                {{ getRoleText(scope.row.role) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="scope">
              <el-button type="primary" size="small" @click="editPlayer(scope.row)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-button>
              <el-button type="danger" size="small" @click="deletePlayer(scope.row.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
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
          <el-table-column prop="id" label="关联ID" width="80" />
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
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="scope">
              <el-button type="danger" size="small" @click="deleteSeasonTeam(scope.row.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
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
          <el-table-column prop="id" label="关联ID" width="80" />
          <el-table-column label="选手" width="180">
            <template #default="scope">
              {{ scope.row.Player ? scope.row.Player.name : getPlayerName(scope.row.playerId) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="scope">
              <el-button type="danger" size="small" @click="deleteSeasonTeamPlayer(scope.row.id)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 查看比赛对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="比赛详情"
      width="80%"
      destroy-on-close
    >
      <div v-if="currentMatch">
        <el-form :model="currentMatch" label-width="120px">
          <el-form-item label="赛季">
            <span>{{ getSeasonName(currentMatch.seasonId) }}</span>
          </el-form-item>
          <el-form-item label="比赛日期">
            <span>{{ formatDate(currentMatch.matchDate) }}</span>
          </el-form-item>
          <el-form-item label="队伍1">
            <span>{{ getTeamName(currentMatch.team1Id) }}</span>
          </el-form-item>
          <el-form-item label="队伍2">
            <span>{{ getTeamName(currentMatch.team2Id) }}</span>
          </el-form-item>
          <el-form-item label="获胜队伍">
            <span>{{ getTeamName(currentMatch.winnerId) }}</span>
          </el-form-item>
          <el-form-item label="地图局数">
            <span>{{ currentMatch.mapGamesCount || 0 }}</span>
          </el-form-item>
        </el-form>
        
        <!-- 地图局详情 -->
        <div v-if="currentMatch.mapGames && currentMatch.mapGames.length > 0" style="margin-top: 20px">
          <h4>地图局详情</h4>
          <div v-for="(mapGame, index) in currentMatch.mapGames" :key="index" style="margin-top: 15px; padding: 15px; border: 1px solid #e8e8e8; border-radius: 8px">
            <h5>地图局 {{ index + 1 }}</h5>
            <el-form :model="mapGame" label-width="120px">
              <el-form-item label="地图">
                <span>{{ getMapName(mapGame.mapId) }}</span>
              </el-form-item>
              <el-form-item label="时长">
                <span>{{ mapGame.duration }} 分钟</span>
              </el-form-item>
              <el-form-item label="获胜队伍">
                <span>{{ getTeamName(mapGame.winnerId) }}</span>
              </el-form-item>
              <el-form-item label="队伍1Ban英雄">
                <span>{{ getHeroName(mapGame.team1BanHeroId) }}</span>
              </el-form-item>
              <el-form-item label="队伍2Ban英雄">
                <span>{{ getHeroName(mapGame.team2BanHeroId) }}</span>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="viewDialogVisible = false">关闭</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 编辑比赛对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="80%"
      destroy-on-close
    >
      <!-- 比赛编辑 -->
      <div v-if="dialogType === 'match'">
        <el-form :model="editForm" :rules="editRules" ref="editFormRef" label-width="120px">
          <el-form-item label="赛季" prop="seasonId">
            <el-select v-model="editForm.seasonId" placeholder="请选择赛季" style="width: 100%">
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
              v-model="editForm.matchDate"
              type="date"
              placeholder="选择日期"
              style="width: 100%"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>
          <el-form-item label="队伍1" prop="team1Id">
            <el-select v-model="editForm.team1Id" placeholder="请选择队伍" style="width: 100%">
              <el-option
                v-for="team in teams"
                :key="team.id"
                :label="team.name"
                :value="team.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="队伍2" prop="team2Id">
            <el-select v-model="editForm.team2Id" placeholder="请选择队伍" style="width: 100%">
              <el-option
                v-for="team in teams"
                :key="team.id"
                :label="team.name"
                :value="team.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="获胜队伍" prop="winnerId">
            <el-select v-model="editForm.winnerId" placeholder="请选择获胜队伍" style="width: 100%">
              <el-option
                v-if="editForm.team1Id"
                :label="getTeamName(editForm.team1Id)"
                :value="editForm.team1Id"
              />
              <el-option
                v-if="editForm.team2Id"
                :label="getTeamName(editForm.team2Id)"
                :value="editForm.team2Id"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      
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
            <el-select v-model="editForm.seasonId" placeholder="请选择赛季" style="width: 100%">
              <el-option
                v-for="season in seasons"
                :key="season.id"
                :label="season.name"
                :value="season.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="队伍" prop="teamId">
            <el-select v-model="editForm.teamId" placeholder="请选择队伍" style="width: 100%">
              <el-option
                v-for="team in teams"
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
            <el-select v-model="editForm.seasonTeamId" placeholder="请选择赛季-队伍" style="width: 100%">
              <el-option
                v-for="seasonTeam in seasonTeams"
                :key="seasonTeam.id"
                :label="getTeamName(seasonTeam.teamId)"
                :value="seasonTeam.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="选手" prop="playerId">
            <el-select v-model="editForm.playerId" placeholder="请选择选手" style="width: 100%">
              <el-option
                v-for="player in players"
                :key="player.id"
                :label="player.name"
                :value="player.id"
              />
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
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';

import { ElMessage, ElMessageBox } from 'element-plus';
import apiService from '../../services/api';

export default {
  name: 'DataManage',
  setup() {
    const store = useStore();
    
    // 标签页管理
    const activeTab = ref('matches');
    
    // 筛选表单
    const filterForm = ref({
      seasonId: '',
      teamId: '',
      winnerId: '',
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
    
    // 比赛列表数据
    const matches = ref([]);
    const loading = ref(false);
    const total = ref(0);
    const currentPage = ref(1);
    const pageSize = ref(10);
    
    // 选中的比赛
    const selectedMatches = ref([]);
    
    // 编辑对话框
    const dialogVisible = ref(false);
    const dialogTitle = ref('编辑比赛');
    const dialogType = ref('match');
    const editForm = ref({});
    const editFormRef = ref(null);
    
    // 查看对话框
    const viewDialogVisible = ref(false);
    const currentMatch = ref(null);
    
    // 编辑验证规则
    const editRules = {
      seasonId: [{ required: true, message: '请选择赛季', trigger: 'change' }],
      matchDate: [{ required: true, message: '请选择比赛日期', trigger: 'change' }],
      team1Id: [{ required: true, message: '请选择队伍1', trigger: 'change' }],
      team2Id: [{ required: true, message: '请选择队伍2', trigger: 'change' }],
      winnerId: [{ required: true, message: '请选择获胜队伍', trigger: 'change' }]
    };
    
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
      teamId: [{ required: true, message: '请选择队伍', trigger: 'change' }]
    };
    
    // 赛季-队伍-选手关联验证规则
    const seasonTeamPlayerRules = {
      seasonTeamId: [{ required: true, message: '请选择赛季-队伍', trigger: 'change' }],
      playerId: [{ required: true, message: '请选择选手', trigger: 'change' }]
    };
    
    // 计算属性
    const seasons = computed(() => store.state.seasons);
    const teams = computed(() => store.state.teams);
    const players = computed(() => store.state.players);
    const seasonTeams = computed(() => store.state.seasonTeams);
    const seasonTeamPlayers = computed(() => store.state.seasonTeamPlayers);
    
    // 格式化日期
    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-CN');
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
    
    // 查看比赛
    const viewMatch = (match) => {
      currentMatch.value = match;
      viewDialogVisible.value = true;
    };
    
    // 加载比赛数据
    const loadMatches = async () => {
      loading.value = true;
      try {
        // 构建筛选条件
        const filters = {
          seasonId: filterForm.value.seasonId,
          teamId: filterForm.value.teamId,
          winnerId: filterForm.value.winnerId,
          startDate: filterForm.value.dateRange[0],
          endDate: filterForm.value.dateRange[1],
          page: currentPage.value,
          pageSize: pageSize.value
        };
        
        await store.dispatch('loadMatches', filters);
        
        // 假设后端返回的数据结构包含分页信息
        // 实际项目中应该由后端返回分页数据
        matches.value = store.state.matches;
        total.value = matches.value.length;
      } catch (error) {
        ElMessage.error('加载比赛数据失败: ' + error.message);
      } finally {
        loading.value = false;
      }
    };
    
    // 加载赛季-队伍关联数据
    const loadSeasonTeams = async () => {
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
        winnerId: '',
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
    
    // 处理选择变化
    const handleSelectionChange = (selection) => {
      selectedMatches.value = selection;
    };
    
    // 处理标签页切换
    const handleTabClick = () => {
      // 切换标签页时的处理逻辑
      if (activeTab.value === 'season-teams') {
        loadSeasonTeams();
      } else if (activeTab.value === 'season-team-players') {
        loadSeasonTeamsForPlayers();
      }
    };
    
    // 添加比赛
    const addMatch = () => {
      dialogTitle.value = '添加比赛';
      dialogType.value = 'match';
      editForm.value = {
        seasonId: '',
        matchDate: '',
        team1Id: '',
        team2Id: '',
        winnerId: ''
      };
      dialogVisible.value = true;
    };
    
    // 编辑比赛
    const editMatch = (match) => {
      dialogTitle.value = '编辑比赛';
      dialogType.value = 'match';
      // 深拷贝比赛数据
      editForm.value = JSON.parse(JSON.stringify(match));
      dialogVisible.value = true;
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
    
    // 添加选手
    const addPlayer = () => {
      dialogTitle.value = '添加选手';
      dialogType.value = 'player';
      editForm.value = {
        name: '',
        role: 'tank'
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
        teamId: ''
      };
      dialogVisible.value = true;
    };
    
    // 添加赛季-队伍-选手关联
    const addSeasonTeamPlayer = () => {
      dialogTitle.value = '添加赛季-队伍-选手关联';
      dialogType.value = 'season-team-player';
      editForm.value = {
        seasonTeamId: seasonTeamPlayerFilter.value.seasonTeamId || '',
        playerId: ''
      };
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
                await store.dispatch('createSeasonTeam', editForm.value);
                ElMessage.success('赛季-队伍关联添加成功');
                loadSeasonTeams();
                break;
              case 'season-team-player':
                await store.dispatch('createSeasonTeamPlayer', editForm.value);
                ElMessage.success('赛季-队伍-选手关联添加成功');
                // 重新加载所有基础数据，确保选手信息完整
                await store.dispatch('loadBaseData');
                // 重新加载赛季-队伍关联数据
                await loadSeasonTeamsForPlayers();
                // 重新加载赛季-队伍-选手关联数据
                await loadSeasonTeamPlayers();
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
    
    // 删除比赛
    const deleteMatch = async (id) => {
      try {
        await ElMessageBox.confirm('确定要删除这场比赛吗？此操作不可恢复。', '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        await store.dispatch('deleteMatch', id);
        ElMessage.success('比赛删除成功');
        loadMatches();
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败: ' + error.message);
        }
      }
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
    
    // 批量删除
    const deleteSelectedMatches = async () => {
      if (selectedMatches.value.length === 0) {
        ElMessage.warning('请选择要删除的比赛');
        return;
      }
      
      try {
        await ElMessageBox.confirm(`确定要删除选中的 ${selectedMatches.value.length} 场比赛吗？此操作不可恢复。`, '警告', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
        
        for (const match of selectedMatches.value) {
          await store.dispatch('deleteMatch', match.id);
        }
        
        ElMessage.success('批量删除成功');
        selectedMatches.value = [];
        loadMatches();
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
      selectedMatches,
      dialogVisible,
      dialogTitle,
      dialogType,
      editForm,
      editFormRef,
      editRules,
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
      viewDialogVisible,
      currentMatch,
      formatDate,
      getSeasonName,
      getTeamName,
      getPlayerName,
      getRoleText,
      getRoleType,
      getMapName,
      getHeroName,
      searchMatches,
      resetFilter,
      handleSizeChange,
      handleCurrentChange,
      handleSelectionChange,
      handleTabClick,
      addMatch,
      editMatch,
      viewMatch,
      addSeason,
      editSeason,
      addTeam,
      editTeam,
      addPlayer,
      editPlayer,
      addSeasonTeam,
      addSeasonTeamPlayer,
      saveEdit,
      deleteMatch,
      deleteSeason,
      deleteTeam,
      deletePlayer,
      deleteSeasonTeam,
      deleteSeasonTeamPlayer,
      deleteSelectedMatches,
      loadSeasonTeams,
      loadSeasonTeamPlayers,
      loadSeasonTeamsForPlayers
    };
  }
};
</script>

<style scoped>
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
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  
  .dialog-footer .el-button {
    width: 100%;
  }
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