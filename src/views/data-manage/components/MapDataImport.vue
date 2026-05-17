<template>
  <div class="map-data-import">
    <el-form :inline="true" class="upload-form">
      <el-form-item label="赛季">
        <el-select v-model="seasonId" placeholder="请选择赛季" style="width: 200px">
           <el-option v-for="s in seasons" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-upload
          action=""
          :auto-upload="false"
          :on-change="handleFileChange"
          :show-file-list="false"
          accept=".xlsx, .xls"
          multiple
        >
          <el-button type="primary">批量选择Excel文件</el-button>
        </el-upload>
      </el-form-item>
    </el-form>

    <div v-if="parsedDataList.length > 0" class="preview-section">
      <el-alert
        title="数据解析完成"
        type="success"
        :description="`成功解析 ${parsedDataList.length} 个文件，请核对信息`"
        show-icon
        :closable="false"
        style="margin-bottom: 20px"
      />
      
      <el-collapse v-model="activeCollapse">
        <el-collapse-item 
          v-for="(item, index) in parsedDataList" 
          :key="index" 
          :name="index"
        >
          <template #title>
             <div class="collapse-title">
                <el-tag size="small" :type="item.error ? 'danger' : (item.warnings && item.warnings.length > 0 ? 'warning' : 'success')" style="margin-right: 10px">
                    {{ item.error ? '解析失败' : (item.warnings && item.warnings.length > 0 ? '有警告' : '成功') }}
                </el-tag>
                <span>{{ item.fileName }}</span>
                <span v-if="!item.error" style="margin-left: 10px; color: #666">
                    - {{ item.map.name }} ({{ item.duration }}分钟)
                </span>
             </div>
          </template>
          
          <div v-if="item.error" class="error-msg">
            {{ item.error }}
          </div>
          
          <div v-else>
            <el-alert
                v-if="item.warnings && item.warnings.length > 0"
                type="warning"
                show-icon
                :closable="false"
                class="warning-alert"
            >
                <template #title>
                    存在以下问题（这些数据将在导入时被忽略）：
                </template>
                <div v-for="(warn, wIdx) in item.warnings" :key="wIdx" class="warning-item">
                    • {{ warn }}
                </div>
            </el-alert>

            <el-descriptions border :column="3" class="info-descriptions">
                <el-descriptions-item label="地图名">{{ item.map.name }}</el-descriptions-item>
                <el-descriptions-item label="获胜队伍">{{ item.resolvedWinnerName }} (原始: {{ item.winnerName }})</el-descriptions-item>
                <el-descriptions-item label="时长">{{ item.duration }} 分钟</el-descriptions-item>
                <el-descriptions-item label="队伍1">{{ item.realTeam1Name }}</el-descriptions-item>
                <el-descriptions-item label="队伍2">{{ item.realTeam2Name }}</el-descriptions-item>
            </el-descriptions>

            <el-table :data="item.finalStats" border stripe size="small" style="width: 100%">
                <el-table-column prop="teamName" label="队伍" width="120" align="center" />
                <el-table-column label="选手" width="180">
                <template #default="scope">
                    <span>{{ scope.row.playerName }}</span>
                    <el-tag size="small" type="info" v-if="scope.row.playerName !== scope.row.originalName">({{ scope.row.originalName }})</el-tag>
                </template>
                </el-table-column>
                <el-table-column prop="heroName" label="英雄" width="120" />
                <el-table-column prop="kill" label="击杀" width="60" align="center" />
                <el-table-column prop="death" label="死亡" width="60" align="center" />
                <el-table-column prop="assist" label="助攻" width="60" align="center" />
                <el-table-column prop="damage" label="伤害" width="80" align="right" />
                <el-table-column prop="cure" label="治疗" width="80" align="right" />
                <el-table-column prop="resist" label="抵挡" width="80" align="right" />
                <el-table-column prop="finalHit" label="最后一击" width="80" align="center" />
            </el-table>
          </div>
        </el-collapse-item>
      </el-collapse>

      <div class="actions">
        <el-button @click="clearAll">清空所有</el-button>
        <el-button type="success" @click="submitBatchImport" :loading="uploading" :disabled="hasErrors">
            确认批量导入 ({{ validCount }}个)
        </el-button>
      </div>
    </div>
  </div>
</template>

<script>
import * as XLSX from 'xlsx';
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';
import apiService from '../../../services/api';

export default {
  name: 'MapDataImport',
  emits: ['success'],
  setup(props, { emit }) {
    const store = useStore();
    const seasons = computed(() => store.state.seasons);
    const seasonId = ref('');
    const parsedDataList = ref([]); // Store list of parsed results
    const uploading = ref(false);
    const activeCollapse = ref([]); // For collapse component

    const validCount = computed(() => parsedDataList.value.filter(item => !item.error).length);
    const hasErrors = computed(() => parsedDataList.value.some(item => item.error));

    // Override the default upload handler to process files one by one or in parallel
    // Element Plus upload component triggers onChange for each file
    // To handle batch selection, we can just process the current file
    
    const processFile = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    if (workbook.SheetNames.length < 2) {
                        resolve({ fileName: file.name, error: 'Excel文件必须包含至少两个Sheet' });
                        return;
                    }

                    // Parse Sheet 1
                    const sheet1 = workbook.Sheets[workbook.SheetNames[0]];
                    const sheet1Json = XLSX.utils.sheet_to_json(sheet1);
                    
                    const mapInfo = {};
                    sheet1Json.forEach(row => {
                        const key = row['key名称'];
                        const value = row['具体值'];
                        if (key) mapInfo[key] = value;
                    });

                    // Parse Duration
                    let duration = 0;
                    if (mapInfo.gameTime) {
                        const timeMatch = mapInfo.gameTime.match(/(\d+)分(\d+)秒/);
                        if (timeMatch) {
                            const m = parseInt(timeMatch[1]);
                            const s = parseInt(timeMatch[2]);
                            duration = parseFloat((m + s / 60).toFixed(2));
                        } else {
                            const num = parseFloat(mapInfo.gameTime);
                            if (!isNaN(num)) duration = num;
                        }
                    }

                    // Parse Sheet 2
                    const sheet2 = workbook.Sheets[workbook.SheetNames[1]];
                    const sheet2Json = XLSX.utils.sheet_to_json(sheet2);
                    
                    const playerStats = sheet2Json.map(row => ({
                        teamId: row['队伍_teamId'],
                        playerName: row['选手名称_playerName'],
                        heroName: row['英雄名称_heroName'],
                        kill: row['击杀数_kill'],
                        death: row['死亡数_death'],
                        assist: row['助攻数_assist'],
                        damage: row['伤害_damage'],
                        cure: row['治疗_cure'],
                        resist: row['抵挡_resist'],
                        finalHit: row['最后一击_finalHit']
                    }));

                    const payload = {
                        seasonId: seasonId.value,
                        mapData: {
                            matchId: mapInfo.matchId,
                            mapName: mapInfo.mapName, 
                            gameTimeStr: mapInfo.gameTime,
                            duration: duration
                        },
                        playerStats
                    };
                    
                    // Preview API call
                    const result = await apiService.previewMapData(payload);
                    resolve({
                        fileName: file.name,
                        rawData: payload, // Store for final submission
                        ...result
                    });

                } catch (err) {
                    const msg = err.response?.data?.error || err.message || '未知错误';
                    resolve({ fileName: file.name, error: msg });
                }
            };
            reader.readAsArrayBuffer(file.raw);
        });
    };

    const handleFileChangeWrapper = async (uploadFile) => {
         if (!seasonId.value) {
            ElMessage.warning('请先选择赛季');
            // Remove the file from the list to avoid confusion? 
            // Element Plus upload list management is a bit tricky with auto-upload=false
            return;
         }
         
         // Only process the newly added file
         // uploadFile is the file that triggered the change
         if (uploadFile.status === 'ready') {
             const result = await processFile(uploadFile);
             parsedDataList.value.push(result);
             // Auto expand the latest one
             activeCollapse.value = [parsedDataList.value.length - 1];
         }
    };

    const clearAll = () => {
        parsedDataList.value = [];
        activeCollapse.value = [];
    };

    const submitBatchImport = async () => {
        const validItems = parsedDataList.value.filter(item => !item.error);
        if (validItems.length === 0) return;

        uploading.value = true;
        let successCount = 0;
        let failCount = 0;

        try {
            // Sequential submission to ensure stability
            for (const item of validItems) {
                try {
                    await apiService.importMapData(item.rawData);
                    successCount++;
                    // Mark as imported or remove? Let's just keep going
                } catch (error) {
                    console.error(`Import failed for ${item.fileName}:`, error);
                    failCount++;
                }
            }

            if (failCount === 0) {
                ElMessage.success(`成功导入 ${successCount} 个文件`);
                clearAll();
                emit('success');
            } else {
                ElMessage.warning(`导入完成：成功 ${successCount} 个，失败 ${failCount} 个`);
                // Optionally remove successful ones from the list
            }
        } catch (error) {
            ElMessage.error('批量导入过程发生错误');
        } finally {
            uploading.value = false;
        }
    };

    return {
        seasons,
        seasonId,
        parsedDataList,
        activeCollapse,
        validCount,
        hasErrors,
        handleFileChange: handleFileChangeWrapper,
        submitBatchImport,
        clearAll,
        uploading
    };
  }
}
</script>

<style scoped>
.map-data-import {
  padding: 20px;
}

.upload-form {
  margin-bottom: 20px;
  padding: 20px;
  background-color: #1a1a1a;
  border-radius: 2px;
  border: 1px solid #333;
}

.preview-section {
  border: 1px solid #333;
  padding: 20px;
  border-radius: 2px;
  background-color: #141414;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 20px 0 15px;
  padding-left: 10px;
  border-left: 4px solid #facc15;
  color: #e0e0e0;
  font-family: 'Oxanium', sans-serif;
}

.warning-alert {
  margin-bottom: 20px;
}
.warning-item {
  font-size: 12px;
  line-height: 1.5;
}
.info-descriptions {
  margin-bottom: 20px;
}

.actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.collapse-title {
  display: flex;
  align-items: center;
  color: #e0e0e0;
}

.error-msg {
  color: #f56c6c;
  padding: 10px;
}
</style>