<template>
  <section class="schedule-shell" aria-labelledby="schedule-title">
    <h2 id="schedule-title" class="visually-hidden">赛程列表</h2>

    <div v-if="hasScheduleData" class="date-rail-wrap">
      <div class="date-rail-scroll">
        <div ref="dateRailRef" class="date-rail" role="group" aria-label="选择比赛日期">
          <button
            type="button"
            class="date-chip date-chip--all"
            :class="{ active: selectedDate === ALL_DATE }"
            :aria-pressed="selectedDate === ALL_DATE"
            @click="selectDate(ALL_DATE)"
          >
            <span class="date-chip-main">全部</span>
            <span class="date-chip-sub">{{ scheduleCount }} 场</span>
          </button>

          <button
            v-for="date in dateOptions"
            :key="date.key"
            :ref="element => setDateChipRef(date.key, element)"
            type="button"
            class="date-chip"
            :class="{ active: selectedDate === date.key, today: date.isToday }"
            :aria-pressed="selectedDate === date.key"
            @click="selectDate(date.key)"
          >
            <span class="date-chip-main">{{ date.monthLabel }}/{{ date.dayLabel }}</span>
            <span class="date-chip-sub">
              {{ date.isToday ? '今天' : date.weekLabel }} · {{ date.count }}
            </span>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="date-picker-trigger"
        :class="{ active: datePickerOpen }"
        aria-label="查看全部比赛日"
        :aria-expanded="datePickerOpen"
        @click="datePickerOpen = true"
      >
        <el-icon aria-hidden="true"><Calendar /></el-icon>
      </button>
    </div>

    <el-drawer
      v-model="datePickerOpen"
      class="schedule-date-drawer"
      direction="btt"
      size="min(68dvh, 520px)"
      :show-close="false"
      :append-to-body="true"
    >
      <template #header>
        <div class="date-picker-heading">
          <span class="date-picker-handle" aria-hidden="true"></span>
          <strong>选择比赛日</strong>
          <span>{{ dateOptions.length }} 个比赛日</span>
        </div>
      </template>

      <div class="date-picker-content">
        <section v-for="group in datePickerGroups" :key="group.key" class="date-picker-group">
          <h3>{{ group.label }}</h3>
          <div class="date-picker-grid">
            <button
              v-for="date in group.options"
              :key="date.key"
              type="button"
              class="date-picker-option"
              :class="{ active: selectedDate === date.key, today: date.isToday }"
              :aria-pressed="selectedDate === date.key"
              @click="selectDateFromPicker(date.key)"
            >
              <strong>{{ date.dayLabel }}日</strong>
              <span>{{ date.isToday ? '今天' : date.weekLabel }} · {{ date.count }} 场</span>
            </button>
          </div>
        </section>
      </div>
    </el-drawer>

    <div v-if="isUpcomingLoading && completedMatches.length" class="schedule-sync" role="status">
      <span class="sync-spinner" aria-hidden="true"></span>
      正在同步未开赛赛程
    </div>

    <div v-if="visibleGroups.length" class="schedule-days">
      <section v-for="group in visibleGroups" :key="group.key" class="schedule-day">
        <header class="day-header">
          <div class="day-title">
            <span class="day-marker" aria-hidden="true"></span>
            <span class="day-date">{{ group.dateLabel }}</span>
            <span v-if="group.isToday" class="today-label">今天</span>
            <span class="day-week">{{ group.weekLabel }}</span>
          </div>
          <span class="day-count">{{ group.matches.length }} 场</span>
        </header>

        <div class="day-matches">
          <article
            v-for="match in group.matches"
            :key="match.key"
            class="schedule-match"
            :class="`is-${match.state}`"
          >
            <button
              type="button"
              class="match-main"
              :aria-label="getMatchAriaLabel(match)"
              @click="openMatch(match)"
            >
              <div class="team-side team-side--left" :class="getTeamStateClass(match, 'left')">
                <span class="team-name" :title="match.team1.name">{{ match.team1.name }}</span>
                <span class="team-logo-box">
                  <img :src="match.team1.logo" class="team-logo" alt="" loading="lazy" />
                </span>
              </div>

              <div class="match-center">
                <div v-if="match.state === 'completed'" class="score-line" aria-label="比赛比分">
                  <span
                    class="winner-indicator winner-indicator--left"
                    :class="{ visible: getTeamStateClass(match, 'left') === 'winner' }"
                    aria-hidden="true"
                  >◀</span>
                  <span class="score-number score-number--left vis-score-num">{{ displayScore(match.team1Score) }}</span>
                  <span class="score-divider">:</span>
                  <span class="score-number score-number--right vis-score-num">{{ displayScore(match.team2Score) }}</span>
                  <span
                    class="winner-indicator winner-indicator--right"
                    :class="{ visible: getTeamStateClass(match, 'right') === 'winner' }"
                    aria-hidden="true"
                  >▶</span>
                </div>
                <div v-else class="versus">VS</div>
                <span class="match-summary">
                  <span v-if="match.timeLabel !== '—'" class="summary-meta">{{ match.timeLabel }}</span>
                  <span v-if="match.timeLabel !== '—' && match.boFormat" class="summary-separator">·</span>
                  <span v-if="match.boFormat" class="summary-meta">{{ match.boFormat }}</span>
                  <span v-if="match.timeLabel !== '—' || match.boFormat" class="summary-separator">·</span>
                  <span class="center-state" :class="`state-${match.state}`">
                    <span v-if="match.state === 'ongoing'" class="vis-live-dot" aria-hidden="true"></span>
                    {{ match.stateLabel }}
                  </span>
                  <span class="match-enter-indicator" aria-hidden="true">↗</span>
                </span>
              </div>

              <div class="team-side team-side--right" :class="getTeamStateClass(match, 'right')">
                <span class="team-logo-box">
                  <img :src="match.team2.logo" class="team-logo" alt="" loading="lazy" />
                </span>
                <span class="team-name" :title="match.team2.name">{{ match.team2.name }}</span>
              </div>

            </button>

            <button
              v-if="match.state === 'completed' && getMapGamesInfo(match.id).length"
              type="button"
              class="replay-toggle"
              :aria-label="`${getMapGamesInfo(match.id).length} 张地图，查看回放`"
              :aria-expanded="isReplaysExpanded(match.id)"
              @click="toggleReplays(match.id)"
            >
              <el-icon aria-hidden="true"><VideoCamera /></el-icon>
              <span class="replay-label">回放</span>
              <span class="replay-count">{{ getMapGamesInfo(match.id).length }}</span>
              <el-icon class="expand-icon" :class="{ expanded: isReplaysExpanded(match.id) }" aria-hidden="true">
                <ArrowDown />
              </el-icon>
            </button>

            <el-collapse-transition>
              <div v-show="isReplaysExpanded(match.id)" class="replay-list">
                <template v-for="(item, index) in getMapGamesInfo(match.id)" :key="`${item.mapId}-${index}`">
                  <button
                    v-if="item.code"
                    type="button"
                    class="replay-tag"
                    :title="`点击复制 ${item.mapName} 代码`"
                    @click="copyCode(item.code)"
                  >
                    <span class="replay-map-name">{{ item.mapName }}</span>
                    <span class="replay-code">{{ item.code }}</span>
                    <el-icon aria-hidden="true"><DocumentCopy /></el-icon>
                  </button>
                  <span v-else class="replay-tag disabled" title="暂无回放代码">
                    <span class="replay-map-name">{{ item.mapName }}</span>
                    <span class="replay-code">—</span>
                  </span>
                </template>
              </div>
            </el-collapse-transition>
          </article>
        </div>
      </section>
    </div>

    <div v-else-if="isUpcomingLoading" class="schedule-empty" role="status">
      <span class="empty-spinner" aria-hidden="true"></span>
      <strong>正在加载赛程</strong>
      <span>稍后即可查看比赛安排</span>
    </div>

    <div v-else class="schedule-empty">
      <span class="empty-mark" aria-hidden="true">VS</span>
      <strong>{{ emptyTitle }}</strong>
      <span>{{ emptyDescription }}</span>
      <button
        v-if="selectedDate !== ALL_DATE"
        type="button"
        class="clear-filter"
        @click="clearFilters"
      >
        查看全部比赛
      </button>
    </div>
  </section>
</template>

<script>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { ArrowDown, Calendar, DocumentCopy, VideoCamera } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import apiService from '@/services/api';
import { trackPublicEvent } from '@/utils/analytics';
import { TBD_TEAM_LOGO_URL } from '@/utils/teamLogos';

const CACHE_KEY = 'liquipedia_upcoming_matches';
const CACHE_EXPIRY = 60 * 1000;
const ALL_DATE = 'all';
const TBD_DATE = 'tbd';
const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
let fetchPromise = null;

const pad2 = value => String(value).padStart(2, '0');

const timestampToDateKey = timestamp => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return TBD_DATE;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const normalizeDateKey = value => {
  const raw = String(value || '').trim();
  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : TBD_DATE;
};

const dateFromKey = key => {
  if (!key || key === TBD_DATE) return null;
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default {
  name: 'MatchSchedule',
  components: {
    ArrowDown,
    Calendar,
    DocumentCopy,
    VideoCamera
  },
  props: {
    matches: {
      type: Array,
      default: () => []
    },
    mapGames: {
      type: Array,
      default: () => []
    },
    seasonId: {
      type: [String, Number],
      default: ''
    },
    liquipediaTournamentName: {
      type: String,
      default: ''
    },
    showUpcoming: {
      type: Boolean,
      default: true
    }
  },
  setup(props) {
    const store = useStore();
    const route = useRoute();
    const router = useRouter();
    const rawUpcomingMatches = ref([]);
    const isUpcomingLoading = ref(false);
    const upcomingUnavailable = ref(false);
    const selectedDate = ref(ALL_DATE);
    const hasInitializedDate = ref(false);
    const datePickerOpen = ref(false);
    const expandedReplays = ref(new Set());
    const dateRailRef = ref(null);
    const dateChipRefs = new Map();

    const getTeamByName = name => {
      const normalizedName = String(name || '').trim();
      if (!normalizedName || normalizedName.toLowerCase() === 'tbd') return null;
      const nameLower = normalizedName.toLowerCase();
      const teams = Array.isArray(store.state.teams) ? store.state.teams : [];
      let matchedTeam = teams.find(team =>
        String(team.name || '').toLowerCase() === nameLower ||
        String(team.abbreviation || '').toLowerCase() === nameLower
      );

      if (!matchedTeam && nameLower.length > 3) {
        matchedTeam = teams.find(team => {
          const teamName = String(team.name || '').toLowerCase();
          return teamName.includes(nameLower) || (teamName.length > 3 && nameLower.includes(teamName));
        });
      }
      return matchedTeam || null;
    };

    const getTeamById = id => {
      const teams = Array.isArray(store.state.teams) ? store.state.teams : [];
      return teams.find(team => String(team.id) === String(id)) || null;
    };

    const normalizeLogo = value => String(value || '').trim() || TBD_TEAM_LOGO_URL;

    const completedMatches = computed(() => (Array.isArray(props.matches) ? props.matches : []).map(match => {
      const localTeam1 = match.team1 || getTeamById(match.team1Id);
      const localTeam2 = match.team2 || getTeamById(match.team2Id);
      return {
        ...match,
        key: `completed-${match.id}`,
        source: 'completed',
        state: 'completed',
        stateLabel: '已结束',
        dateKey: normalizeDateKey(match.matchDate),
        timestamp: null,
        timeLabel: '—',
        boFormat: String(match.boFormat || '').trim(),
        team1: {
          name: String(localTeam1?.name || 'Unknown'),
          logo: normalizeLogo(localTeam1?.logo)
        },
        team2: {
          name: String(localTeam2?.name || 'Unknown'),
          logo: normalizeLogo(localTeam2?.logo)
        }
      };
    }));

    const isEstimatedOngoing = timestamp => {
      if (!Number.isFinite(timestamp)) return false;
      const now = Date.now();
      return timestamp <= now && timestamp > now - 8 * 60 * 60 * 1000;
    };

    const upcomingMatches = computed(() => {
      if (!props.showUpcoming || !props.liquipediaTournamentName) return [];
      const targetName = props.liquipediaTournamentName.toLowerCase();

      return rawUpcomingMatches.value
        .filter(match => String(match?.tournamentName || '').toLowerCase().includes(targetName))
        .filter(match => {
          const team1Name = String(match?.team1?.name || match?.teamA?.name || match?.team1 || '').toLowerCase();
          const team2Name = String(match?.team2?.name || match?.teamB?.name || match?.team2 || '').toLowerCase();
          const isTbd = name => !name || name === 'tbd' || name === 'to be determined' || name.includes('tbd');
          if (isTbd(team1Name) && isTbd(team2Name)) return false;

          if (import.meta.env.MODE === 'static' && Number.isFinite(match?.timestamp)) {
            return match.timestamp >= Date.now() - 8 * 60 * 60 * 1000;
          }
          return true;
        })
        .map((match, index) => {
          const timestamp = Number.isFinite(match?.timestamp) ? match.timestamp : null;
          const apiTeam1Name = String(match?.team1?.name || match?.teamA?.name || match?.team1 || 'TBD').trim() || 'TBD';
          const apiTeam2Name = String(match?.team2?.name || match?.teamB?.name || match?.team2 || 'TBD').trim() || 'TBD';
          const localTeam1 = getTeamByName(apiTeam1Name);
          const localTeam2 = getTeamByName(apiTeam2Name);
          const ongoing = isEstimatedOngoing(timestamp);

          return {
            key: `upcoming-${timestamp || 'tbd'}-${apiTeam1Name}-${apiTeam2Name}-${index}`,
            id: null,
            source: 'upcoming',
            state: ongoing ? 'ongoing' : 'upcoming',
            stateLabel: ongoing ? '预计进行中' : '未开始',
            dateKey: timestamp ? timestampToDateKey(timestamp) : TBD_DATE,
            timestamp,
            timeLabel: timestamp ? `${pad2(new Date(timestamp).getHours())}:${pad2(new Date(timestamp).getMinutes())}` : '待定',
            boFormat: '',
            tournamentName: String(match?.tournamentName || '').trim(),
            link: String(match?.link || '').trim(),
            team1Score: null,
            team2Score: null,
            winnerId: null,
            team1: {
              name: localTeam1?.name || apiTeam1Name,
              logo: normalizeLogo(localTeam1?.logo)
            },
            team2: {
              name: localTeam2?.name || apiTeam2Name,
              logo: normalizeLogo(localTeam2?.logo)
            }
          };
        })
        .sort((left, right) => (left.timestamp || Number.MAX_SAFE_INTEGER) - (right.timestamp || Number.MAX_SAFE_INTEGER));
    });

    const allScheduleMatches = computed(() => [...upcomingMatches.value, ...completedMatches.value]);
    const hasScheduleData = computed(() => allScheduleMatches.value.length > 0);

    const sortDateGroups = (left, right) => {
      if (left.key === TBD_DATE) return 1;
      if (right.key === TBD_DATE) return -1;
      const leftHasUpcoming = left.matches.some(match => match.source === 'upcoming');
      const rightHasUpcoming = right.matches.some(match => match.source === 'upcoming');
      if (leftHasUpcoming !== rightHasUpcoming) return leftHasUpcoming ? -1 : 1;
      return leftHasUpcoming
        ? left.key.localeCompare(right.key)
        : right.key.localeCompare(left.key);
    };

    const groupedStatusMatches = computed(() => {
      const grouped = new Map();
      allScheduleMatches.value.forEach(match => {
        if (!grouped.has(match.dateKey)) grouped.set(match.dateKey, []);
        grouped.get(match.dateKey).push(match);
      });

      return [...grouped.entries()].map(([key, matches]) => ({
        key,
        matches: [...matches].sort((left, right) => {
          if (left.source === 'upcoming' && right.source === 'upcoming') {
            return (left.timestamp || Number.MAX_SAFE_INTEGER) - (right.timestamp || Number.MAX_SAFE_INTEGER);
          }
          return Number(right.id || 0) - Number(left.id || 0);
        })
      })).sort(sortDateGroups);
    });

    const todayKey = computed(() => timestampToDateKey(Date.now()));

    const dateOptions = computed(() => groupedStatusMatches.value.map(group => {
      const date = dateFromKey(group.key);
      return {
        key: group.key,
        count: group.matches.length,
        isToday: group.key === todayKey.value,
        monthLabel: date ? pad2(date.getMonth() + 1) : '--',
        dayLabel: date ? pad2(date.getDate()) : '待定',
        weekLabel: date ? WEEK_LABELS[date.getDay()] : '时间待定'
      };
    }));

    const datePickerGroups = computed(() => {
      const groups = new Map();
      dateOptions.value.forEach(option => {
        const date = dateFromKey(option.key);
        const key = date ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}` : TBD_DATE;
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label: date ? `${date.getFullYear()}年${date.getMonth() + 1}月` : '时间待定',
            options: []
          });
        }
        groups.get(key).options.push(option);
      });
      return [...groups.values()];
    });

    const visibleGroups = computed(() => groupedStatusMatches.value
      .filter(group => selectedDate.value === ALL_DATE || group.key === selectedDate.value)
      .map(group => {
        const date = dateFromKey(group.key);
        return {
          ...group,
          isToday: group.key === todayKey.value,
          dateLabel: date
            ? `${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日`
            : '时间待定',
          weekLabel: date ? WEEK_LABELS[date.getDay()] : ''
        };
      }));

    const findDefaultDate = () => {
      const keys = dateOptions.value.map(item => item.key);
      if (!keys.length) return ALL_DATE;
      if (keys.includes(todayKey.value)) return todayKey.value;
      const futureKey = keys
        .filter(key => key !== TBD_DATE && key > todayKey.value)
        .sort()[0];
      if (futureKey) return futureKey;
      const pastKey = keys
        .filter(key => key !== TBD_DATE && key < todayKey.value)
        .sort()
        .reverse()[0];
      return pastKey || keys[0];
    };

    const scrollSelectedDateIntoView = () => {
      if (selectedDate.value === ALL_DATE) {
        dateRailRef.value?.scrollTo({ left: 0, behavior: 'smooth' });
        return;
      }
      dateChipRefs.get(selectedDate.value)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    };

    const initializeDate = ({ force = false } = {}) => {
      const keys = dateOptions.value.map(item => item.key);
      if (!force && hasInitializedDate.value && (selectedDate.value === ALL_DATE || keys.includes(selectedDate.value))) return;
      selectedDate.value = findDefaultDate();
      hasInitializedDate.value = true;
      nextTick(scrollSelectedDateIntoView);
    };

    const selectDate = key => {
      selectedDate.value = key;
      nextTick(scrollSelectedDateIntoView);
    };

    const selectDateFromPicker = key => {
      selectedDate.value = key;
      datePickerOpen.value = false;
      nextTick(scrollSelectedDateIntoView);
    };

    const setDateChipRef = (key, element) => {
      if (element) dateChipRefs.set(key, element);
      else dateChipRefs.delete(key);
    };

    const remapUpcomingResponse = responseData => {
      const list = Array.isArray(responseData)
        ? responseData
        : (Array.isArray(responseData?.data) ? responseData.data : []);
      rawUpcomingMatches.value = list;
    };

    const fetchUpcomingMatches = async () => {
      rawUpcomingMatches.value = [];
      upcomingUnavailable.value = false;
      hasInitializedDate.value = false;

      if (!props.showUpcoming || !props.liquipediaTournamentName) {
        isUpcomingLoading.value = false;
        initializeDate({ force: true });
        return;
      }

      isUpcomingLoading.value = true;
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_EXPIRY && Array.isArray(parsed.data)) {
            rawUpcomingMatches.value = parsed.data;
            return;
          }
          sessionStorage.removeItem(CACHE_KEY);
        }

        if (!fetchPromise) fetchPromise = apiService.getUpcomingMatches();
        const responseData = await fetchPromise;
        remapUpcomingResponse(responseData);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: rawUpcomingMatches.value
        }));
      } catch (error) {
        upcomingUnavailable.value = true;
        console.error('Failed to fetch upcoming matches:', error);
      } finally {
        isUpcomingLoading.value = false;
        fetchPromise = null;
        initializeDate({ force: true });
      }
    };

    const getMapName = mapId => {
      const maps = Array.isArray(store.state.maps) ? store.state.maps : [];
      return maps.find(map => String(map.id) === String(mapId))?.name || '未知地图';
    };

    const getMapGamesInfo = matchId => {
      if (!matchId || !Array.isArray(props.mapGames)) return [];
      return props.mapGames
        .filter(mapGame => String(mapGame.matchId) === String(matchId))
        .sort((left, right) => Number(left.id) - Number(right.id))
        .map(mapGame => ({
          mapId: mapGame.mapId,
          mapName: getMapName(mapGame.mapId),
          code: String(mapGame.replayId || '').trim() || null
        }));
    };

    const toggleReplays = matchId => {
      const next = new Set(expandedReplays.value);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      expandedReplays.value = next;
    };

    const isReplaysExpanded = matchId => expandedReplays.value.has(matchId);

    const copyCode = async code => {
      try {
        await navigator.clipboard.writeText(code);
        ElMessage.success({ message: `录像代码 ${code} 已复制`, duration: 2000 });
      } catch (error) {
        ElMessage.error('复制失败');
      }
    };

    const openCompletedMatch = match => {
      trackPublicEvent('首页-打开比赛详情', {
        source: 'match_schedule',
        seasonId: match.seasonId,
        matchId: match.id
      }, route);

      const matchData = {
        id: match.id,
        seasonId: match.seasonId,
        tournamentName: match.tournamentName || '',
        matchDate: match.matchDate || '',
        boFormat: match.boFormat || '',
        team1Id: match.team1Id,
        team2Id: match.team2Id,
        team1Name: match.team1.name,
        team2Name: match.team2.name,
        team1Logo: match.team1.logo,
        team2Logo: match.team2.logo,
        team1Score: match.team1Score,
        team2Score: match.team2Score,
        winnerId: match.winnerId
      };
      sessionStorage.setItem('current_match_detail', JSON.stringify(matchData));

      router.push({
        path: '/visualize/match-detail',
        query: {
          matchId: String(match.id),
          seasonId: String(match.seasonId || ''),
          tab: 'recent',
          from: 'visualize',
          tournament: match.tournamentName || '',
          team1Id: String(match.team1Id || ''),
          team2Id: String(match.team2Id || ''),
          team1: match.team1.name,
          team2: match.team2.name,
          team1Logo: match.team1.logo,
          team2Logo: match.team2.logo
        }
      });
    };

    const openUpcomingMatch = match => {
      if (!props.seasonId) return;
      trackPublicEvent('首页-打开未开赛详情', {
        source: 'match_schedule',
        seasonId: props.seasonId,
        team1Name: match.team1.name,
        team2Name: match.team2.name
      }, route);

      sessionStorage.setItem('current_upcoming_match', JSON.stringify({
        seasonId: props.seasonId,
        team1: match.team1.name,
        team2: match.team2.name,
        team1Logo: match.team1.logo,
        team2Logo: match.team2.logo,
        time: match.timestamp,
        tournament: match.tournamentName
      }));

      router.push({
        path: '/visualize/upcoming-match',
        query: {
          seasonId: props.seasonId,
          t1: match.team1.name,
          t2: match.team2.name
        }
      });
    };

    const openMatch = match => {
      if (match.source === 'completed') openCompletedMatch(match);
      else openUpcomingMatch(match);
    };

    const getTeamStateClass = (match, side) => {
      if (match.state !== 'completed') return '';
      const teamId = side === 'left' ? match.team1Id : match.team2Id;
      return String(match.winnerId) === String(teamId) ? 'winner' : 'loser';
    };

    const displayScore = score => score === null || score === undefined ? '—' : score;

    const getMatchAriaLabel = match => {
      const result = match.state === 'completed'
        ? `${displayScore(match.team1Score)} 比 ${displayScore(match.team2Score)}`
        : match.stateLabel;
      return `${match.team1.name} 对阵 ${match.team2.name}，${result}`;
    };

    const emptyTitle = computed(() => {
      if (upcomingUnavailable.value && !completedMatches.value.length) return '暂时无法获取赛程';
      if (selectedDate.value !== ALL_DATE) return '这个比赛日暂无赛事';
      return '当前赛季暂无比赛';
    });

    const emptyDescription = computed(() => upcomingUnavailable.value
      ? '请稍后再试'
      : '切换日期或比赛状态查看其他安排');

    const clearFilters = () => {
      selectedDate.value = ALL_DATE;
      nextTick(scrollSelectedDateIntoView);
    };

    onMounted(fetchUpcomingMatches);

    watch(
      () => [props.seasonId, props.liquipediaTournamentName, props.showUpcoming],
      fetchUpcomingMatches
    );

    watch(completedMatches, () => {
      if (!isUpcomingLoading.value && !hasInitializedDate.value) initializeDate({ force: true });
    });

    return {
      ALL_DATE,
      scheduleCount: computed(() => allScheduleMatches.value.length),
      completedMatches,
      selectedDate,
      datePickerOpen,
      dateOptions,
      datePickerGroups,
      visibleGroups,
      hasScheduleData,
      isUpcomingLoading,
      emptyTitle,
      emptyDescription,
      dateRailRef,
      setDateChipRef,
      selectDate,
      selectDateFromPicker,
      getTeamStateClass,
      displayScore,
      getMatchAriaLabel,
      openMatch,
      getMapGamesInfo,
      toggleReplays,
      isReplaysExpanded,
      copyCode,
      clearFilters
    };
  }
};
</script>

<style scoped>
.schedule-shell {
  width: min(1180px, 100%);
  margin: 0 auto 24px;
  padding: 0 20px 12px;
  box-sizing: border-box;
  background: #fff;
  color: var(--vis-text-primary);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.date-chip:focus-visible,
.date-picker-trigger:focus-visible,
.match-main:focus-visible,
.replay-toggle:focus-visible,
.replay-tag:focus-visible,
.clear-filter:focus-visible {
  outline: 2px solid var(--vis-accent);
  outline-offset: 2px;
}

.date-rail-wrap {
  position: relative;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--vis-border);
  background: #fff;
}

.date-rail-wrap::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 34px;
  background: linear-gradient(90deg, transparent, #fff);
  pointer-events: none;
}

.date-rail-scroll {
  min-width: 0;
}

.date-picker-trigger {
  display: none;
}

.date-rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 34px 0 0;
  scrollbar-width: none;
  overscroll-behavior-inline: contain;
}

.date-rail::-webkit-scrollbar {
  display: none;
}

.date-chip {
  position: relative;
  min-width: 66px;
  min-height: 68px;
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: 27px 18px;
  align-items: center;
  justify-content: center;
  column-gap: 3px;
  padding: 9px 8px 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--vis-text-secondary);
  cursor: pointer;
  transition: color var(--vis-dur-fast) var(--vis-ease), background-color var(--vis-dur-fast) var(--vis-ease);
}

.date-chip::after {
  content: '';
  position: absolute;
  right: 8px;
  bottom: 0;
  left: 8px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--vis-primary-gradient);
  transform: scaleX(0) skewX(var(--vis-slant));
  transition: transform var(--vis-dur) var(--vis-ease);
}

.date-chip-main {
  font-family: var(--vis-font-numeric);
  font-size: 18px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.date-chip-sub {
  grid-column: 1 / -1;
  color: var(--vis-text-tertiary);
  font-size: 11px;
  font-weight: 500;
}

.date-chip-count {
  align-self: start;
  min-width: 12px;
  padding: 0 3px;
  border-radius: 2px;
  background: #f2f3f5;
  color: #a0a4aa;
  font-family: var(--vis-font-numeric);
  font-size: 8px;
  font-weight: 800;
}

.date-chip--all {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 68px;
}

.date-chip--all .date-chip-main {
  font-family: var(--vis-font-body);
  font-size: 14px;
  font-weight: 650;
}

.date-chip.active,
.date-chip.today {
  color: var(--vis-accent);
}

.date-chip.active {
  background: #fff;
}

.date-chip.active::after {
  transform: scaleX(1) skewX(var(--vis-slant));
}

.date-chip.active .date-chip-sub {
  color: #b6530e;
}

.date-chip.active .date-chip-count {
  background: var(--vis-primary-gradient);
  color: #fff;
}

.schedule-sync {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: -6px 0 12px;
  color: var(--vis-text-tertiary);
  font-size: 11px;
}

.sync-spinner,
.empty-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(17, 17, 17, 0.08);
  border-top-color: var(--vis-accent);
  border-radius: 999px;
  animation: schedule-spin 0.8s linear infinite;
}

@keyframes schedule-spin {
  to { transform: rotate(360deg); }
}

.schedule-days {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.schedule-day {
  min-width: 0;
}

.day-header {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 2px 7px;
}

.day-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.day-marker {
  width: 3px;
  height: 15px;
  flex: 0 0 auto;
  border-radius: 1px;
  background: var(--vis-primary-gradient);
  transform: skewX(var(--vis-slant));
}

.day-date {
  color: var(--vis-text-strong);
  font-family: var(--vis-font-body);
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.day-week,
.day-count {
  color: var(--vis-text-tertiary);
  font-size: 11px;
  font-weight: 650;
}

.today-label {
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--vis-primary-gradient);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
}

.day-matches {
  overflow: hidden;
  border: 0;
  border-top: 1px solid var(--vis-border);
  border-bottom: 1px solid var(--vis-border);
  border-radius: 0;
  background: var(--vis-bg-card);
  box-shadow: none;
}

.schedule-match + .schedule-match {
  border-top: 1px solid var(--vis-border);
}

.match-main {
  width: 100%;
  min-height: 82px;
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr) 108px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 12px;
  padding: 12px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--vis-dur-fast) var(--vis-ease);
}

.match-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.match-time {
  color: var(--vis-text-strong);
  font-family: var(--vis-font-numeric);
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.is-completed .match-time {
  color: var(--vis-text-tertiary);
}

.match-format {
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--vis-text-tertiary);
  font-family: var(--vis-font-numeric);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.05em;
}

.team-side {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-side--left {
  justify-content: flex-end;
  text-align: right;
}

.team-side--right {
  justify-content: flex-start;
}

.team-logo-box {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: grid;
  place-items: center;
}

.team-logo {
  max-width: 34px;
  max-height: 34px;
  width: auto;
  height: auto;
  object-fit: contain;
}

.team-name {
  min-width: 0;
  overflow: hidden;
  color: var(--vis-text-strong);
  font-family: var(--vis-font-body);
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: opacity var(--vis-dur-fast) var(--vis-ease);
}

.team-side.winner .team-name {
  font-weight: 750;
}

.team-side.loser {
  opacity: 0.56;
}

.match-center {
  position: relative;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
}

.match-center::before {
  content: '';
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 50%;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--vis-border-strong) 24%, var(--vis-border-strong) 76%, transparent);
  transform: translateX(-50%);
  z-index: 0;
}

.score-line,
.versus {
  position: relative;
  z-index: 1;
  min-width: 62px;
  padding: 1px 7px;
  background: #fff;
  color: var(--vis-text-strong);
  font-family: var(--vis-font-numeric);
  font-size: 21px;
  font-weight: 750;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.score-line {
  display: flex;
  justify-content: center;
  gap: 7px;
}

.score-divider {
  color: var(--vis-text-tertiary);
  font-size: 17px;
}

.versus {
  color: var(--vis-text-tertiary);
  font-size: 17px;
  font-style: italic;
}

.center-state,
.mobile-state {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--vis-bg-muted);
  color: var(--vis-text-tertiary);
  font-size: 9px;
  font-weight: 750;
  white-space: nowrap;
}

.state-upcoming {
  background: var(--vis-team-right-soft);
  color: #b6530e;
}

.state-ongoing {
  background: rgba(245, 108, 108, 0.12);
  color: #c43d3d;
}

.match-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  font-size: 14px;
  transition: color var(--vis-dur-fast) var(--vis-ease), transform var(--vis-dur-fast) var(--vis-ease);
}

.match-action .el-icon {
  font-size: 14px;
}

.replay-area {
  border-top: 1px solid var(--vis-border);
  background: #fff;
}

.replay-toggle {
  width: 100%;
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 14px;
  border: 0;
  background: transparent;
  color: var(--vis-text-tertiary);
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
  transition: color var(--vis-dur-fast) var(--vis-ease), background-color var(--vis-dur-fast) var(--vis-ease);
}

.replay-toggle > .el-icon:first-child {
  color: #b6bac1;
}

.expand-icon {
  transition: transform var(--vis-dur) var(--vis-ease);
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.replay-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 4px 16px 12px;
}

.replay-tag {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--vis-border);
  border-radius: 6px;
  background: #fff;
  color: var(--vis-text-primary);
  cursor: pointer;
  font-family: var(--vis-font-body);
  font-size: 10px;
}

.replay-map-name {
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-right: 1px solid var(--vis-border);
  background: var(--vis-bg-muted);
  color: var(--vis-text-secondary);
  font-weight: 700;
}

.replay-code {
  padding: 0 7px;
  font-family: var(--vis-font-numeric);
  font-weight: 650;
  letter-spacing: 0.04em;
}

.replay-tag .el-icon {
  margin-right: 7px;
  color: var(--vis-text-tertiary);
}

.replay-tag.disabled {
  cursor: default;
  opacity: 0.58;
}

.schedule-empty {
  min-height: 230px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--vis-border-strong);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.48);
  color: var(--vis-text-tertiary);
  font-size: 12px;
  text-align: center;
}

.schedule-empty strong {
  color: var(--vis-text-secondary);
  font-size: 14px;
}

.empty-mark {
  color: rgba(17, 17, 17, 0.12);
  font-family: var(--vis-font-numeric);
  font-size: 30px;
  font-style: italic;
  font-weight: 900;
}

.empty-spinner {
  width: 22px;
  height: 22px;
}

.clear-filter {
  min-height: 36px;
  margin-top: 4px;
  padding: 7px 13px;
  border: 1px solid var(--vis-border-strong);
  border-radius: 999px;
  background: #fff;
  color: var(--vis-text-strong);
  cursor: pointer;
  font-weight: 700;
}

@media (hover: hover) and (pointer: fine) {
  .date-chip:hover {
    color: var(--vis-text-strong);
    background: rgba(17, 17, 17, 0.04);
  }

  .match-main:hover {
    background: linear-gradient(90deg, rgba(17, 17, 17, 0.015), rgba(255, 106, 0, 0.045), rgba(17, 17, 17, 0.015));
  }

  .match-main:hover .match-action {
    color: var(--vis-accent);
    transform: translateX(2px);
  }

  .replay-toggle:hover {
    background: var(--vis-bg-subtle);
    color: var(--vis-text-strong);
  }

  .replay-tag:not(.disabled):hover {
    border-color: rgba(255, 106, 0, 0.35);
  }
}

@media (max-width: 900px) {
  .match-main {
    grid-template-columns: 72px minmax(0, 1fr) 104px minmax(0, 1fr) 78px;
    gap: 9px;
    padding-right: 12px;
    padding-left: 12px;
  }

  .team-name {
    font-size: 14px;
  }

  .team-logo-box {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
  }

  .team-logo {
    max-width: 33px;
    max-height: 33px;
  }
}

@media (max-width: 768px) {
  .schedule-shell {
    width: calc(100% + 20px);
    margin-right: -10px;
    margin-left: -10px;
    margin-bottom: 20px;
    padding-right: 16px;
    padding-left: 16px;
  }

  .date-rail-wrap {
    margin-right: -16px;
    margin-bottom: 14px;
    margin-left: -16px;
  }

  .date-rail {
    padding-left: 16px;
  }

  .schedule-days {
    gap: 18px;
  }

  .day-header {
    padding-right: 2px;
    padding-left: 2px;
  }

  .day-date {
    font-size: 13px;
  }

  .day-matches {
    margin-right: -16px;
    margin-left: -16px;
  }

  .match-main {
    min-height: 92px;
    grid-template-columns: 46px minmax(0, 1fr) 58px minmax(0, 1fr);
    grid-template-rows: minmax(68px, auto);
    gap: 6px;
    padding: 10px 8px;
  }

  .match-meta {
    grid-column: 1;
    grid-row: 1;
    align-items: flex-start;
  }

  .match-time {
    font-size: 13px;
  }

  .match-format {
    padding: 1px 5px;
    font-size: 8px;
  }

  .team-side--left {
    grid-column: 2;
    grid-row: 1;
  }

  .match-center {
    grid-column: 3;
    grid-row: 1;
  }

  .team-side--right {
    grid-column: 4;
    grid-row: 1;
  }

  .team-side {
    align-self: center;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }

  .team-side--left,
  .team-side--right {
    justify-content: center;
  }

  .team-side--left .team-name {
    order: 2;
  }

  .team-logo-box {
    width: 31px;
    height: 31px;
    flex-basis: 31px;
  }

  .team-logo {
    max-width: 29px;
    max-height: 29px;
  }

  .team-name {
    max-width: 100%;
    font-size: 12px;
    text-align: center;
  }

  .match-center {
    align-self: center;
    min-height: 52px;
  }

  .match-center::before {
    top: 2px;
    bottom: 2px;
  }

  .score-line,
  .versus {
    min-width: 54px;
    padding: 1px 5px;
    font-size: 18px;
  }

  .versus {
    font-size: 15px;
  }

  .score-divider {
    font-size: 13px;
  }

  .center-state,
  .match-action {
    display: none;
  }

  .center-state {
    display: inline-flex;
  }

  .replay-toggle {
    min-height: 38px;
  }

  .replay-list {
    justify-content: flex-start;
    padding-right: 10px;
    padding-left: 10px;
  }
}

@media (max-width: 380px) {
  .match-main {
    grid-template-columns: 42px minmax(0, 1fr) 54px minmax(0, 1fr);
    padding-right: 6px;
    padding-left: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .date-chip,
  .date-chip::after,
  .match-main,
  .match-action,
  .replay-toggle,
  .expand-icon {
    transition: none;
  }

  .vis-live-dot,
  .sync-spinner,
  .empty-spinner {
    animation: none;
  }
}
</style>

<style scoped>
/* Compact schedule layout: one date strip, one information row per match. */
.schedule-shell {
  width: 100%;
  margin: 0;
  padding: 0;
  background: #f5f6f8;
}

.date-rail-wrap {
  margin: 0;
  border-bottom: 1px solid #e5e8ec;
  background: #f3f5f7;
  box-shadow: none;
}

.date-rail-wrap::after {
  width: 24px;
  background: linear-gradient(90deg, rgba(243, 245, 247, 0), #f3f5f7 72%);
}

.date-rail {
  gap: 0;
  min-height: 48px;
  padding: 0 24px 0 4px;
}

.date-chip {
  min-width: 72px;
  min-height: 48px;
  grid-template-columns: 1fr;
  grid-template-rows: 20px 14px;
  gap: 0;
  padding: 5px 7px 4px;
}

.date-chip.active {
  background: #fff;
  box-shadow: none;
}

.date-chip::after {
  right: 7px;
  left: 7px;
}

.date-chip-main {
  grid-column: 1;
  font-family: var(--vis-font-body);
  font-size: 15px;
  font-weight: 700;
  line-height: 19px;
}

.date-chip-sub {
  grid-column: 1;
  overflow: hidden;
  color: #707782;
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date-chip-count {
  display: none;
}

.date-chip--all {
  min-width: 58px;
  gap: 0;
}

.date-chip--all .date-chip-main {
  font-size: 14px;
  line-height: 19px;
}

.schedule-sync {
  min-height: 26px;
  margin: 0;
}

.schedule-days {
  gap: 6px;
  background: #f5f6f8;
}

.day-header {
  min-height: 31px;
  padding: 0 12px;
  border-bottom: 1px solid #e7eaee;
  background: #f1f3f5;
  box-shadow: none;
}

.day-title {
  gap: 6px;
}

.day-marker {
  width: 2px;
  height: 12px;
}

.day-date {
  font-size: 13px;
  font-weight: 700;
}

.day-week,
.day-count {
  color: #6f7680;
  font-size: 11px;
  font-weight: 500;
}

.today-label {
  padding: 1px 5px;
  font-size: 8px;
}

.day-matches {
  overflow: visible;
  border: 0;
  background: #fff;
  box-shadow: none;
}

.schedule-match {
  position: relative;
  background: #fff;
}

.schedule-match + .schedule-match {
  border-top: 1px solid #e9edf1;
}

.schedule-match.is-ongoing::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  z-index: 1;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: #e74c4c;
  box-shadow: 0 0 8px rgba(231, 76, 76, 0.26);
}

.match-main {
  max-width: 980px;
  min-height: 76px;
  grid-template-columns: minmax(0, 1fr) 138px minmax(0, 1fr);
  gap: 12px;
  margin: 0 auto;
  padding: 10px 12px;
}

.match-meta {
  display: none;
}

.match-time {
  font-family: var(--vis-font-body);
  font-size: 15px;
  line-height: 20px;
}

.match-format {
  padding: 0;
  color: #707782;
  font-family: var(--vis-font-body);
  font-size: 11px;
  line-height: 15px;
  letter-spacing: 0;
}

.team-side {
  gap: 7px;
}

.team-logo-box {
  width: 34px;
  height: 34px;
  flex-basis: 34px;
}

.team-logo {
  max-width: 32px;
  max-height: 32px;
}

.team-name {
  color: #3f454d;
  font-family: var(--vis-font-display);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.team-side--left .team-name {
  color: var(--vis-team-left);
}

.team-side--right .team-name {
  color: var(--vis-team-right);
}

.team-side.loser {
  opacity: 1;
}

.team-side.loser .team-logo {
  opacity: 0.72;
}

.team-side.winner .team-name {
  font-weight: 900;
}

.match-center {
  gap: 3px;
}

.match-center::before {
  display: none;
}

.score-line,
.versus {
  min-width: 58px;
  padding: 0 4px;
  font-family: var(--vis-font-numeric);
  font-size: 20px;
  font-weight: 700;
  line-height: 24px;
  letter-spacing: 0;
}

.score-line {
  min-width: 102px;
  align-items: center;
  gap: 4px;
  background: transparent;
}

.score-number {
  min-width: 18px;
  text-align: center;
}

.score-number--left {
  color: var(--vis-team-left);
}

.score-number--right {
  color: var(--vis-team-right);
}

.winner-indicator {
  width: 9px;
  flex: 0 0 9px;
  font-family: var(--vis-font-body);
  font-size: 8px;
  line-height: 1;
  text-align: center;
  opacity: 0;
}

.winner-indicator--left {
  color: var(--vis-team-left);
}

.winner-indicator--right {
  color: var(--vis-team-right);
}

.winner-indicator.visible {
  opacity: 1;
}

.score-divider {
  font-size: 15px;
}

.versus {
  font-size: 16px;
  color: #767d87;
  letter-spacing: -0.03em;
}

.center-state {
  padding: 0;
  background: transparent;
  color: #5f6772;
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
}

.match-summary {
  min-height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #707782;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.summary-meta,
.summary-separator {
  color: #707782;
  font-weight: 500;
}

.summary-separator {
  color: #b0b5bc;
}

.match-enter-indicator {
  color: #a0a6af;
  font-family: var(--vis-font-display);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  opacity: 0.78;
  transform: translateY(-1px);
  transition: color var(--vis-dur-fast) var(--vis-ease), opacity var(--vis-dur-fast) var(--vis-ease);
}

.center-state.state-upcoming,
.center-state.state-ongoing {
  background: transparent;
}

.center-state.state-upcoming {
  color: #b6530e;
}

.center-state.state-ongoing {
  color: #c43d3d;
}

.replay-toggle {
  position: static;
  width: 100%;
  min-height: 30px;
  gap: 5px;
  padding: 5px 10px;
  border-top: 1px solid #eef0f2;
  background: #fafbfc;
  color: #737b85;
  font-family: var(--vis-font-body);
  font-size: 11px;
}

.replay-count {
  color: #959ba4;
  font-size: 10px;
}

.replay-toggle > .el-icon:first-child {
  color: #a9afb7;
}

.replay-toggle .expand-icon {
  font-size: 8px;
}

.replay-list {
  justify-content: center;
  gap: 6px;
  padding: 6px 10px 8px;
  border-top: 1px solid #f3f4f6;
  background: #fafbfc;
}

.replay-tag {
  min-height: 28px;
  font-size: 9px;
}

.replay-map-name,
.replay-code {
  padding-right: 6px;
  padding-left: 6px;
}

.schedule-empty {
  min-height: 120px;
  border-radius: 0;
}

@media (hover: hover) and (pointer: fine) {
  .match-main:hover {
    background: #f8f9fa;
    box-shadow: none;
  }

  .match-main:hover .match-enter-indicator {
    color: var(--vis-accent);
    opacity: 1;
  }

  .replay-toggle:hover {
    background: transparent;
    color: var(--vis-accent);
  }
}

@media (max-width: 900px) {
  .match-main {
    grid-template-columns: minmax(0, 1fr) 112px minmax(0, 1fr);
    gap: 8px;
    padding-right: 8px;
    padding-left: 8px;
  }
}

@media (max-width: 768px) {
  .schedule-shell {
    width: calc(100% + 20px);
    margin: 0 -10px 10px;
    padding: 0 0 52px;
    background: #fff;
  }

  .date-rail-wrap {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px;
    margin: 0;
    border-top: 1px solid #dfe3e7;
    border-bottom: 0;
    background: rgba(248, 249, 250, 0.97);
    box-shadow: 0 -4px 14px rgba(17, 17, 17, 0.07);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .date-rail-wrap::after {
    display: none;
  }

  .date-rail-scroll {
    position: relative;
    min-width: 0;
    overflow: hidden;
  }

  .date-rail-scroll::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 18px;
    background: linear-gradient(90deg, rgba(248, 249, 250, 0), #f8f9fa 78%);
    pointer-events: none;
  }

  .date-rail {
    width: 100%;
    height: 48px;
    min-height: 48px;
    padding: 0 16px 0 4px;
    box-sizing: border-box;
  }

  .date-picker-trigger {
    position: relative;
    z-index: 1;
    display: grid;
    width: 48px;
    height: 48px;
    place-items: center;
    padding: 0;
    border: 0;
    border-left: 1px solid #dfe3e7;
    background: rgba(248, 249, 250, 0.98);
    color: #747b85;
    cursor: pointer;
    touch-action: manipulation;
    transition: color 160ms ease, background-color 160ms ease;
  }

  .date-picker-trigger::after {
    content: '';
    position: absolute;
    right: 12px;
    bottom: 0;
    left: 12px;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: var(--vis-primary-gradient);
    transform: scaleX(0);
    transition: transform 160ms ease;
  }

  .date-picker-trigger.active {
    background: #fff;
    color: var(--vis-accent);
  }

  .date-picker-trigger.active::after {
    transform: scaleX(1);
  }

  .date-picker-trigger .el-icon {
    font-size: 19px;
  }

  .date-chip {
    min-width: 66px;
    height: 48px;
    min-height: 48px;
    grid-template-rows: 19px 14px;
    align-content: center;
    padding: 4px 6px 3px;
    box-sizing: border-box;
    touch-action: manipulation;
  }

  .date-chip-main {
    font-size: 15px;
    line-height: 19px;
  }

  .date-chip-sub {
    line-height: 14px;
  }

  .date-chip--all {
    display: grid;
    min-width: 54px;
    grid-template-columns: 1fr;
    grid-template-rows: 19px 14px;
    align-content: center;
    gap: 0;
  }

  .date-chip--all .date-chip-main {
    font-size: 15px;
    line-height: 19px;
  }

  .schedule-days {
    gap: 8px;
  }

  .day-header {
    min-height: 30px;
    padding: 0 10px;
  }

  .day-count {
    display: inline;
  }

  .day-matches {
    margin: 0;
  }

  .match-main {
    min-height: 76px;
    grid-template-columns: minmax(0, 1fr) 86px minmax(0, 1fr);
    grid-template-rows: 1fr;
    gap: 4px;
    padding: 7px 4px;
    touch-action: manipulation;
  }

  .match-time {
    font-size: 13px;
    line-height: 18px;
  }

  .match-format {
    padding: 0;
    font-size: 10px;
    line-height: 15px;
  }

  .team-side--left {
    grid-column: 1;
    grid-row: 1;
  }

  .match-center {
    grid-column: 2;
    grid-row: 1;
    min-height: 54px;
  }

  .team-side--right {
    grid-column: 3;
    grid-row: 1;
  }

  .team-side {
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }

  .team-side--left,
  .team-side--right {
    justify-content: center;
  }

  .team-side--left .team-name {
    order: 2;
  }

  .team-logo-box {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
  }

  .team-logo {
    max-width: 30px;
    max-height: 30px;
  }

  .team-name {
    max-width: 100%;
    font-size: 12px;
    line-height: 16px;
    text-align: center;
  }

  .score-line,
  .versus {
    min-width: 54px;
    padding: 0 2px;
    font-size: 19px;
    line-height: 23px;
  }

  .score-line {
    min-width: 82px;
    gap: 3px;
  }

  .score-number {
    min-width: 16px;
  }

  .winner-indicator {
    width: 7px;
    flex-basis: 7px;
    font-size: 7px;
  }

  .versus {
    font-size: 15px;
  }

  .center-state {
    display: inline-flex;
    font-size: 10px;
    line-height: 15px;
  }

  .match-summary {
    gap: 3px;
    font-size: 10px;
    line-height: 15px;
  }

  .match-action {
    display: inline-flex;
  }

  .replay-toggle {
    min-height: 34px;
    touch-action: manipulation;
  }

  .replay-list {
    gap: 5px;
    padding: 5px 6px 7px;
  }
}

@media (max-width: 380px) {
  .match-main {
    grid-template-columns: minmax(0, 1fr) 82px minmax(0, 1fr);
    gap: 4px;
  }
}
</style>

<style>
@media (max-width: 768px) {
  .schedule-date-drawer.el-drawer {
    overflow: hidden;
    border-radius: 16px 16px 0 0;
    background: #f6f7f9;
    box-shadow: 0 -14px 36px rgba(15, 23, 42, 0.18);
  }

  .schedule-date-drawer .el-drawer__header {
    min-height: 58px;
    margin: 0;
    padding: 7px 16px 9px;
    border-bottom: 1px solid #e4e7eb;
    background: rgba(255, 255, 255, 0.94);
    box-sizing: border-box;
  }

  .schedule-date-drawer .el-drawer__body {
    padding: 0 12px 14px;
    overscroll-behavior: contain;
  }

  .date-picker-heading {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: 12px 24px;
    align-items: center;
    color: #17191c;
  }

  .date-picker-handle {
    grid-column: 1 / -1;
    justify-self: center;
    width: 34px;
    height: 4px;
    border-radius: 999px;
    background: #d6d9de;
  }

  .date-picker-heading strong {
    font-size: 15px;
    font-weight: 750;
    letter-spacing: 0.01em;
  }

  .date-picker-heading > span:last-child {
    color: #858b94;
    font-size: 11px;
    font-weight: 500;
  }

  .date-picker-content {
    padding: 9px 0 4px;
  }

  .date-picker-option {
    min-height: 48px;
    border: 1px solid #e1e4e8;
    background: #fff;
    color: #24272b;
    cursor: pointer;
    touch-action: manipulation;
    transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
  }

  .date-picker-group {
    margin-top: 8px;
  }

  .date-picker-group + .date-picker-group {
    margin-top: 12px;
  }

  .date-picker-group h3 {
    margin: 0;
    padding: 0 4px 6px;
    color: #747b85;
    font-size: 11px;
    font-weight: 650;
    line-height: 18px;
  }

  .date-picker-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .date-picker-option {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 56px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 5px 3px 6px;
    overflow: hidden;
    border-radius: 9px;
  }

  .date-picker-option::after {
    content: '';
    position: absolute;
    right: 18px;
    bottom: 0;
    left: 18px;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: linear-gradient(90deg, #ff3d00, #ff8a00);
    transform: scaleX(0);
    transition: transform 160ms ease;
  }

  .date-picker-option strong {
    font-family: var(--vis-font-numeric, inherit);
    font-size: 14px;
    font-weight: 720;
    line-height: 20px;
    font-variant-numeric: tabular-nums;
  }

  .date-picker-option span {
    overflow: hidden;
    max-width: 100%;
    color: #7c838d;
    font-size: 10px;
    line-height: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date-picker-option.active {
    border-color: rgba(255, 98, 0, 0.42);
    background: #fff8f3;
    color: #e95300;
  }

  .date-picker-option.active::after {
    transform: scaleX(1);
  }

  .date-picker-option.today:not(.active) span {
    color: #e75b0b;
  }

  .date-picker-option:focus-visible {
    outline: 2px solid #ff6a00;
    outline-offset: 2px;
  }
}
</style>
