<template>
  <section class="team-editor" :style="{ '--team-accent': accent }">
    <header class="team-editor__header">
      <div>
        <h3>{{ title }}</h3>
        <p>选手汇总保留在主表，英雄使用明细按行展开编辑。</p>
      </div>
      <el-tag effect="plain" size="small">{{ filledStatsCount }} 名选手</el-tag>
    </header>

    <div class="team-editor__table-wrap">
      <el-table :data="stats" row-key="editorKey" size="small" class="team-editor__table">
        <el-table-column type="expand" width="42">
          <template #default="scope">
            <div class="hero-editor">
              <div class="hero-editor__heading">
                <div>
                  <strong>英雄使用明细</strong>
                  <span>数据属于当前地图局和当前选手。</span>
                </div>
                <el-button size="small" plain @click="addHeroStat(scope.row)">添加英雄</el-button>
              </div>

              <el-empty
                v-if="!scope.row.heroStats.length"
                description="暂无英雄明细"
                :image-size="48"
              />
              <div v-else class="hero-editor__rows">
                <div
                  v-for="(heroStat, heroIndex) in scope.row.heroStats"
                  :key="heroStat.editorKey"
                  class="hero-editor__row"
                >
                  <label>
                    <span>英雄</span>
                    <el-select
                      v-model="heroStat.heroId"
                      filterable
                      clearable
                      placeholder="搜索英雄"
                      @change="syncHeroName(heroStat)"
                    >
                      <el-option v-for="hero in heroes" :key="hero.id" :label="hero.name" :value="hero.id" />
                    </el-select>
                  </label>
                  <label><span>使用秒数</span><el-input-number v-model="heroStat.usageSeconds" :min="0" :controls="false" /></label>
                  <label><span>使用占比 %</span><el-input-number v-model="heroStat.usagePercentage" :min="0" :max="100" :precision="2" :controls="false" /></label>
                  <label><span>最后一击</span><el-input-number v-model="heroStat.finalBlows" :min="0" :controls="false" /></label>
                  <label><span>被最后一击</span><el-input-number v-model="heroStat.deathsByFinalBlow" :min="0" :controls="false" /></label>
                  <label><span>终极技能就绪</span><el-input-number v-model="heroStat.ultReady" :min="0" :controls="false" /></label>
                  <label><span>终极技能使用</span><el-input-number v-model="heroStat.ultUsed" :min="0" :controls="false" /></label>
                  <label><span>平均充能秒数</span><el-input-number v-model="heroStat.avgUltChargeSeconds" :min="0" :precision="2" :controls="false" /></label>
                  <el-button type="danger" plain size="small" @click="removeHeroStat(scope.row, heroIndex)">删除</el-button>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column width="58" align="left">
          <template #default="scope">
            <span
              class="hero-count"
              :class="{ 'hero-count--active': scope.row.heroStats.length > 0 }"
              :title="`英雄明细 ${scope.row.heroStats.length} 条`"
              :aria-label="`英雄明细 ${scope.row.heroStats.length} 条`"
            >{{ scope.row.heroStats.length }} 条</span>
          </template>
        </el-table-column>

        <el-table-column label="选手" min-width="150">
          <template #default="scope">
            <el-select v-model="scope.row.playerId" filterable clearable placeholder="搜索选手" @change="onPlayerChange(scope.row)">
              <el-option
                v-for="player in playersForRole(scope.row.role)"
                :key="player.id"
                :label="player.name"
                :value="player.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="职责" width="102">
          <template #default="scope">
            <el-select v-model="scope.row.role" filterable clearable placeholder="职责" @change="scope.row.playerId = ''">
              <el-option label="T" value="tank" />
              <el-option label="D" value="damage" />
              <el-option label="S" value="support" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="K/A/D" width="105">
          <template #default="scope"><el-input v-model="scope.row.kad" placeholder="0/0/0" /></template>
        </el-table-column>
        <el-table-column label="最后一击" width="92">
          <template #default="scope"><el-input-number v-model="scope.row.finalBlows" :min="0" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="大招" width="78">
          <template #default="scope"><el-input-number v-model="scope.row.ultsUsed" :min="0" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="伤害" width="112">
          <template #default="scope"><el-input-number v-model="scope.row.damage" :min="0" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="治疗" width="112">
          <template #default="scope"><el-input-number v-model="scope.row.healing" :min="0" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="减伤" width="112">
          <template #default="scope"><el-input-number v-model="scope.row.mitigation" :min="0" :controls="false" /></template>
        </el-table-column>
        <el-table-column label="操作" width="72" fixed="right" align="center">
          <template #default="scope"><el-button type="danger" plain size="small" @click="clearRow(scope.row)">清空</el-button></template>
        </el-table-column>
      </el-table>
    </div>

    <el-button class="team-editor__add" plain size="small" @click="$emit('add-row')">添加选手</el-button>
  </section>
</template>

<script>
export default {
  name: 'PlayerStatsEditor',
  props: {
    stats: { type: Array, required: true },
    title: { type: String, required: true },
    teamId: { type: Number, required: true },
    availablePlayers: { type: Array, default: () => [] },
    fallbackPlayers: { type: Array, default: () => [] },
    heroes: { type: Array, default: () => [] },
    accent: { type: String, default: '#facc15' }
  },
  emits: ['add-row'],
  computed: {
    filledStatsCount() {
      return this.stats.filter(stat => stat.playerId).length;
    }
  },
  methods: {
    playersForRole(role) {
      const source = this.availablePlayers.length ? this.availablePlayers : this.fallbackPlayers;
      return source.filter(player => !role || player.role === role);
    },
    onPlayerChange(stat) {
      const player = [...this.availablePlayers, ...this.fallbackPlayers].find(item => item.id === stat.playerId);
      if (player) stat.role = player.role;
    },
    addHeroStat(stat) {
      stat.heroStats.push({
        editorKey: `new-hero-${Date.now()}-${stat.heroStats.length}`,
        heroId: null,
        heroName: '',
        usageSeconds: 0,
        usagePercentage: 0,
        finalBlows: 0,
        deathsByFinalBlow: 0,
        ultReady: 0,
        ultUsed: 0,
        avgUltChargeSeconds: null
      });
    },
    removeHeroStat(stat, index) {
      stat.heroStats.splice(index, 1);
    },
    syncHeroName(heroStat) {
      heroStat.heroName = this.heroes.find(hero => hero.id === heroStat.heroId)?.name || '';
    },
    clearRow(stat) {
      Object.assign(stat, {
        playerId: '', kad: '', damage: 0, healing: 0, mitigation: 0,
        finalBlows: 0, ultsUsed: 0, heroId: null, heroStats: []
      });
    }
  }
};
</script>

<style scoped>
.team-editor { padding: 16px; border: 1px solid #333; border-left: 4px solid var(--team-accent); background: #1a1a1a; }
.team-editor__header, .hero-editor__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.team-editor__header h3 { margin: 0; color: var(--team-accent); font: 600 16px 'Oxanium', sans-serif; }
.team-editor__header p, .hero-editor__heading span { margin: 5px 0 14px; color: #8f8f8f; font-size: 12px; }
.team-editor__table-wrap { overflow-x: auto; }
.team-editor__table { min-width: 1000px; }
.team-editor__table :deep(.el-input-number) { width: 100%; }
.hero-count { color: #777; font-size: 12px; white-space: nowrap; }
.hero-count--active { color: var(--team-accent); font-weight: 600; }
.team-editor__add { width: 100%; margin-top: 12px; }
.hero-editor { padding: 12px 16px 18px 56px; background: #141414; }
.hero-editor__heading strong, .hero-editor__heading span { display: block; }
.hero-editor__rows { display: grid; gap: 10px; }
.hero-editor__row { display: grid; grid-template-columns: minmax(150px, 1.5fr) repeat(7, minmax(105px, 1fr)) 64px; align-items: end; gap: 8px; overflow-x: auto; }
.hero-editor__row label > span { display: block; margin-bottom: 5px; color: #999; font-size: 11px; }
.hero-editor__row :deep(.el-input-number) { width: 100%; }
@media (max-width: 900px) { .hero-editor { padding-left: 12px; } }
</style>
