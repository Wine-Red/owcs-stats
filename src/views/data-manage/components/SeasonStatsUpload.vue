<template>
  <div class="season-stats-upload">
    <el-card class="upload-card">
      <template #header>
        <div class="card-header">
          <span>赛季选手数据总览表上传</span>
        </div>
      </template>
      
      <el-form :model="form" label-width="120px">
        <el-form-item label="选择赛季">
          <el-select v-model="form.seasonId" placeholder="请选择赛季" :disabled="uploading || previewMode">
            <el-option
              v-for="season in seasons"
              :key="season.id"
              :label="season.name"
              :value="season.id"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="上传文件">
          <input type="file" ref="fileInput" @change="handleFileChange" accept=".xlsx, .xls, .csv" :disabled="uploading || previewMode" />
          <div class="file-tip">支持 .xlsx, .xls, .csv 格式，上传将覆盖该赛季现有数据</div>
        </el-form-item>
        
        <el-form-item>
          <div v-if="!previewMode">
            <el-button type="primary" @click="handlePreview" :loading="uploading">普通解析预览</el-button>
            <el-button type="success" @click="handleAIPreview" :loading="uploading" style="margin-left: 10px;">AI 智能解析预览</el-button>
          </div>
          <div v-else class="action-buttons">
            <el-button type="warning" @click="cancelPreview" :disabled="uploading">取消</el-button>
            <el-button type="success" @click="confirmUpload" :loading="uploading">确认导入</el-button>
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="upload-card">
      <template #header>
        <div class="card-header">
          <span>阶段快照（仅积分榜）</span>
        </div>
      </template>

      <el-form label-width="120px">
        <el-form-item label="快照名称">
          <el-input v-model="currentStageLabel" style="max-width: 240px" disabled />
          <div class="file-tip" style="margin-left: 10px; margin-top: 0;">来自“赛季可视化配置”的当前阶段名称</div>
          <el-button type="primary" style="margin-left: 10px" @click="createSnapshot" :loading="snapshotBusy" :disabled="!form.seasonId">保存快照</el-button>
        </el-form-item>

        <el-form-item label="已有快照">
          <el-table :data="snapshots" style="width: 100%" size="small" border>
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column label="创建时间" width="200">
              <template #default="scope">
                {{ formatDateTime(scope.row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" align="center">
              <template #default="scope">
                <el-button type="danger" size="small" @click="deleteSnapshot(scope.row.id)" :loading="snapshotBusy">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="previewMode && previewData.length > 0" class="preview-card">
      <template #header>
        <div class="card-header">
          <span>数据预览 (共 {{ previewData.length }} 条)</span>
          <div class="preview-stats">
             <el-tag type="success">有效: {{ validCount }}</el-tag>
             <el-tag type="warning">警告: {{ warningCount }}</el-tag>
          </div>
        </div>
      </template>
      
      <div class="extra-summaries">
        <div class="summary-row">
          <span class="summary-label">战队比分统计</span>
          <template v-if="teamScorePreviewSummary && teamScorePreviewSummary.found">
            <el-tag type="success">有效: {{ teamScorePreviewSummary.validCount }}</el-tag>
            <el-tag v-if="teamScorePreviewSummary.warningCount" type="warning">警告: {{ teamScorePreviewSummary.warningCount }}</el-tag>
          </template>
          <el-tag v-else type="warning">未找到/无法识别</el-tag>
        </div>
        <div class="summary-row">
          <span class="summary-label">地图选取次数</span>
          <template v-if="mapPickPreviewSummary && mapPickPreviewSummary.found">
            <el-tag type="success">有效: {{ mapPickPreviewSummary.validCount }}</el-tag>
            <el-tag v-if="mapPickPreviewSummary.warningCount" type="warning">警告: {{ mapPickPreviewSummary.warningCount }}</el-tag>
          </template>
          <el-tag v-else type="warning">未找到/无法识别</el-tag>
        </div>
      </div>

      <el-table :data="previewData" style="width: 100%" height="500" stripe border>
        <el-table-column prop="status" label="状态" width="100" fixed>
          <template #default="scope">
            <el-tag :type="scope.row.status === 'valid' ? 'success' : 'warning'">
              {{ scope.row.status === 'valid' ? '有效' : '警告' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="playerName" label="选手" width="150" />
        <el-table-column prop="teamName" label="队伍" width="150" />
        <el-table-column prop="role" label="位置" width="100">
           <template #default="scope">
             {{ getRoleText(scope.row.role) }}
           </template>
        </el-table-column>
        <el-table-column prop="playerStatus" label="选手匹配" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.playerStatus === 'existing' ? 'info' : 'success'" effect="plain">
              {{ scope.row.playerStatus === 'existing' ? '已存在' : '新创建' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="teamStatus" label="队伍匹配" width="120">
          <template #default="scope">
            <el-tag :type="scope.row.teamStatus === 'existing' ? 'info' : 'success'" effect="plain">
              {{ scope.row.teamStatus === 'existing' ? '已存在' : '新创建' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="详细信息" min-width="200">
          <template #default="scope">
            <span v-if="scope.row.message" class="error-text">{{ scope.row.message }}</span>
            <span v-else class="detail-text">
               原始位置: {{ scope.row.rawRole }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import { ref, onMounted, computed, watch } from 'vue';
import { useStore } from 'vuex';
import apiService from '@/services/api';
import { ElMessage } from 'element-plus';

export default {
  name: 'SeasonStatsUpload',
  setup() {
    const store = useStore();
    const seasons = computed(() => store.state.seasons);
    const form = ref({
      seasonId: '',
      file: null
    });
    const uploading = ref(false);
    const fileInput = ref(null);
    const previewMode = ref(false);
    const aiMode = ref(false);
    const mapping = ref(null);
    const previewData = ref([]);
    const teamScorePreviewSummary = ref(null);
    const mapPickPreviewSummary = ref(null);
    const snapshots = ref([]);
    const currentStageLabel = ref('当前阶段');
    const snapshotBusy = ref(false);

    onMounted(async () => {
        if (seasons.value.length === 0) {
            await store.dispatch('loadBaseData');
        }
        // Default to in_progress season
        const activeSeason = seasons.value.find(s => s.status === 'in_progress');
        if (activeSeason) {
            form.value.seasonId = activeSeason.id;
        }
        await loadCurrentStageLabel();
        await loadSnapshots();
    });

    const loadSnapshots = async () => {
      if (!form.value.seasonId) {
        snapshots.value = [];
        return;
      }
      try {
        snapshotBusy.value = true;
        const res = await apiService.getSeasonStageSnapshots(form.value.seasonId);
        snapshots.value = Array.isArray(res) ? res : res?.data || [];
      } catch (error) {
        snapshots.value = [];
      } finally {
        snapshotBusy.value = false;
      }
    };

    watch(() => form.value.seasonId, () => {
      loadSnapshots();
      loadCurrentStageLabel();
    });

    const loadCurrentStageLabel = async () => {
      if (!form.value.seasonId) {
        currentStageLabel.value = '当前阶段';
        return;
      }
      try {
        const config = await apiService.getConfig(`visualize_season_${form.value.seasonId}`);
        const label = String(config?.standings?.currentStageLabel || '当前阶段').trim();
        currentStageLabel.value = label || '当前阶段';
      } catch (e) {
        currentStageLabel.value = '当前阶段';
      }
    };

    const createSnapshot = async () => {
      if (!form.value.seasonId) return;
      const name = String(currentStageLabel.value || '').trim();
      if (!name) {
        ElMessage.warning('请输入快照名称');
        return;
      }
      snapshotBusy.value = true;
      try {
        await apiService.createSeasonStageSnapshot(form.value.seasonId, { name });
        ElMessage.success('快照已保存');
        await loadSnapshots();
      } catch (error) {
        ElMessage.error('保存失败: ' + (error.response?.data?.error || error.message));
      } finally {
        snapshotBusy.value = false;
      }
    };

    const deleteSnapshot = async (snapshotId) => {
      snapshotBusy.value = true;
      try {
        await apiService.deleteSeasonStageSnapshot(snapshotId);
        ElMessage.success('快照已删除');
        await loadSnapshots();
      } catch (error) {
        ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message));
      } finally {
        snapshotBusy.value = false;
      }
    };

    const formatDateTime = (value) => {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString();
    };

    const handleFileChange = (e) => {
      form.value.file = e.target.files[0];
      previewMode.value = false;
      aiMode.value = false;
      mapping.value = null;
      previewData.value = [];
      teamScorePreviewSummary.value = null;
      mapPickPreviewSummary.value = null;
    };

    const validCount = computed(() => previewData.value.filter(item => item.status === 'valid').length);
    const warningCount = computed(() => previewData.value.filter(item => item.status === 'warning').length);

    const handlePreview = async () => {
      if (!form.value.seasonId) {
        ElMessage.warning('请选择赛季');
        return;
      }
      if (!form.value.file) {
        ElMessage.warning('请选择文件');
        return;
      }

      uploading.value = true;
      aiMode.value = false;
      mapping.value = null;
      const formData = new FormData();
      formData.append('seasonId', form.value.seasonId);
      formData.append('file', form.value.file);
      formData.append('dryRun', 'true');

      try {
        const response = await apiService.uploadSeasonStats(formData);
        if (response && response.preview) {
            previewData.value = response.preview;
            teamScorePreviewSummary.value = response.teamScorePreviewSummary || null;
            mapPickPreviewSummary.value = response.mapPickPreviewSummary || null;
            previewMode.value = true;
            ElMessage.success('普通解析成功，请确认数据');
        }
      } catch (error) {
        console.error(error);
        ElMessage.error('解析失败: ' + (error.response?.data?.error || error.message));
      } finally {
        uploading.value = false;
      }
    };

    const handleAIPreview = async () => {
      if (!form.value.seasonId) {
        ElMessage.warning('请选择赛季');
        return;
      }
      if (!form.value.file) {
        ElMessage.warning('请选择文件');
        return;
      }

      uploading.value = true;
      aiMode.value = true;
      const formData = new FormData();
      formData.append('seasonId', form.value.seasonId);
      formData.append('file', form.value.file);

      try {
        const response = await apiService.previewAISeasonStats(formData);
        if (response && response.preview) {
            previewData.value = response.preview;
            mapping.value = response.mapping;
            teamScorePreviewSummary.value = response.teamScorePreviewSummary || null;
            mapPickPreviewSummary.value = response.mapPickPreviewSummary || null;
            previewMode.value = true;
            ElMessage.success('AI 智能解析成功，请确认数据');
        }
      } catch (error) {
        console.error(error);
        ElMessage.error('AI 解析失败: ' + (error.response?.data?.error || error.message));
      } finally {
        uploading.value = false;
      }
    };

    const confirmUpload = async () => {
      if (!form.value.seasonId || !form.value.file) return;

      uploading.value = true;
      const formData = new FormData();
      formData.append('seasonId', form.value.seasonId);
      formData.append('file', form.value.file);
      formData.append('dryRun', 'false');
      
      if (aiMode.value && mapping.value) {
          formData.append('mapping', JSON.stringify(mapping.value));
      }

      try {
        const response = await apiService.uploadSeasonStats(formData);
        ElMessage.success(`导入成功，共更新 ${response.count} 条数据`);
        // Clear file input
        form.value.file = null;
        if (fileInput.value) fileInput.value.value = '';
        previewMode.value = false;
        aiMode.value = false;
        mapping.value = null;
        previewData.value = [];
      } catch (error) {
        console.error(error);
        ElMessage.error('导入失败: ' + (error.response?.data?.error || error.message));
      } finally {
        uploading.value = false;
      }
    };

    const cancelPreview = () => {
        previewMode.value = false;
        aiMode.value = false;
        mapping.value = null;
        previewData.value = [];
        teamScorePreviewSummary.value = null;
        mapPickPreviewSummary.value = null;
    };
    
    const getRoleText = (role) => {
        const map = {
            'tank': '重装',
            'damage': '输出',
            'support': '支援'
        };
        return map[role] || role;
    };

    return {
      form,
      seasons,
      uploading,
      handleFileChange,
      handlePreview,
      handleAIPreview,
      confirmUpload,
      cancelPreview,
      fileInput,
      previewMode,
      previewData,
      validCount,
      warningCount,
      teamScorePreviewSummary,
      mapPickPreviewSummary,
      getRoleText,
      snapshots,
      currentStageLabel,
      snapshotBusy,
      createSnapshot,
      deleteSnapshot,
      formatDateTime
    };
  }
};
</script>

<style scoped>
.upload-card {
  max-width: 800px;
  margin: 20px 0;
}
.preview-card {
    margin-top: 20px;
}
.file-tip {
  font-size: 12px;
  color: #999;
  margin-top: 5px;
}
.action-buttons {
    display: flex;
    gap: 10px;
}
.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.preview-stats {
    display: flex;
    gap: 10px;
}
.extra-summaries {
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.summary-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.summary-label {
    font-size: 13px;
    font-weight: 600;
    color: #333;
}
.error-text {
    color: #F56C6C;
}
.detail-text {
    color: #909399;
    font-size: 12px;
}
</style>
