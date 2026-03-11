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
import { ref, onMounted, computed } from 'vue';
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

    onMounted(async () => {
        if (seasons.value.length === 0) {
            await store.dispatch('loadBaseData');
        }
        // Default to in_progress season
        const activeSeason = seasons.value.find(s => s.status === 'in_progress');
        if (activeSeason) {
            form.value.seasonId = activeSeason.id;
        }
    });

    const handleFileChange = (e) => {
      form.value.file = e.target.files[0];
      previewMode.value = false;
      aiMode.value = false;
      mapping.value = null;
      previewData.value = [];
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
    };
    
    const getRoleText = (role) => {
        const map = {
            'tank': '坦克',
            'damage': '输出',
            'support': '辅助',
            'flex': '自由人'
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
      getRoleText
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
.error-text {
    color: #F56C6C;
}
.detail-text {
    color: #909399;
    font-size: 12px;
}
</style>
