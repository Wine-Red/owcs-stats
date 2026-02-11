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
        >
          <el-button type="primary">选择Excel文件</el-button>
        </el-upload>
      </el-form-item>
    </el-form>

    <div v-if="parsedData" class="preview-section">
      <el-alert
        title="数据解析成功"
        type="success"
        description="请核对以下信息，确认无误后点击导入"
        show-icon
        :closable="false"
        style="margin-bottom: 20px"
      />

      <div class="section-title">对局信息 (Sheet 1)</div>
      <el-descriptions border :column="3" class="info-descriptions">
        <el-descriptions-item label="地图名">{{ parsedData.map.name }}</el-descriptions-item>
        <el-descriptions-item label="获胜队伍">{{ parsedData.resolvedWinnerName }} (原始: {{ parsedData.winnerName }})</el-descriptions-item>
        <el-descriptions-item label="时长">{{ parsedData.duration }} 分钟</el-descriptions-item>
        <el-descriptions-item label="队伍1">{{ parsedData.realTeam1Name }}</el-descriptions-item>
        <el-descriptions-item label="队伍2">{{ parsedData.realTeam2Name }}</el-descriptions-item>
      </el-descriptions>

      <div class="section-title">选手数据 (Sheet 2) - 共 {{ parsedData.finalStats.length }} 条</div>
      <el-table :data="parsedData.finalStats" height="400" border stripe size="small">
        <el-table-column prop="teamName" label="队伍" width="120" align="center" />
        <el-table-column label="选手" width="180">
          <template #default="scope">
            <span>{{ scope.row.playerName }}</span>
            <el-tag size="small" type="info" v-if="scope.row.playerName !== scope.row.originalName">({{ scope.row.originalName }})</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="heroName" label="英雄" width="120" />
        <el-table-column prop="kill" label="击杀" width="80" align="center" />
        <el-table-column prop="death" label="死亡" width="80" align="center" />
        <el-table-column prop="assist" label="助攻" width="80" align="center" />
        <el-table-column prop="damage" label="伤害" width="100" align="right" />
        <el-table-column prop="cure" label="治疗" width="100" align="right" />
        <el-table-column prop="resist" label="抵挡" width="100" align="right" />
        <el-table-column prop="finalHit" label="最后一击" width="100" align="center" />
      </el-table>

      <div class="actions">
        <el-button @click="parsedData = null">取消</el-button>
        <el-button type="success" @click="submitImport" :loading="uploading">确认导入</el-button>
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
    const parsedData = ref(null);
    const uploading = ref(false);
    const rawData = ref(null); // Store raw data for final submission

    const handleFileChange = (file) => {
      if (!seasonId.value) {
         ElMessage.warning('请先选择赛季');
         return;
      }
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          if (workbook.SheetNames.length < 2) {
             ElMessage.error('Excel文件必须包含至少两个Sheet');
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
          
          rawData.value = payload;
          
          // Call preview API
          uploading.value = true;
          try {
             const result = await apiService.previewMapData(payload);
             parsedData.value = result;
             ElMessage.success('解析成功，请确认数据');
          } catch (err) {
             const msg = err.response?.data?.error || err.message || '未知错误';
             ElMessage.error('预览失败: ' + msg);
             parsedData.value = null;
          } finally {
             uploading.value = false;
          }

        } catch (error) {
          console.error(error);
          ElMessage.error('解析Excel失败: ' + error.message);
        }
      };
      reader.readAsArrayBuffer(file.raw);
    };

    const submitImport = async () => {
        if (!rawData.value) return;

        uploading.value = true;
        try {
            await apiService.importMapData(rawData.value);
            ElMessage.success('导入成功');
            parsedData.value = null;
            rawData.value = null;
            emit('success');
        } catch (error) {
            const msg = error.response?.data?.error || error.message || '未知错误';
            ElMessage.error('导入失败: ' + msg);
        } finally {
            uploading.value = false;
        }
    };

    return {
        seasons,
        seasonId,
        parsedData,
        handleFileChange,
        submitImport,
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
  background-color: #f5f7fa;
  border-radius: 4px;
}

.preview-section {
  border: 1px solid #ebeef5;
  padding: 20px;
  border-radius: 4px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  margin: 20px 0 15px;
  padding-left: 10px;
  border-left: 4px solid #409eff;
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
</style>