<template>
  <div class="admin-tournament-detail">
    <el-page-header @back="router.push('/admin/tournament')">
      <template #content>
        <span class="page-title">{{ tournament?.name || '赛事管理' }}</span>
        <el-tag :type="getStatusType(tournament?.status)" style="margin-left: 12px;">
          {{ getStatusText(tournament?.status) }}
        </el-tag>
      </template>
    </el-page-header>

    <!-- 管理标签页 -->
    <el-tabs v-model="tab" style="margin-top: 20px;">
      <!-- 基本信息 -->
      <el-tab-pane label="基本信息" name="info">
        <el-card shadow="never">
          <el-form :model="form" label-width="100px">
            <el-row :gutter="16">
              <el-col :span="16">
                <el-form-item label="赛事名称">
                  <el-input v-model="form.name" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="缩写">
                  <el-input v-model="form.acronym" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="中文简介">
              <el-input v-model="form.desc_zh" type="textarea" :rows="2" placeholder="中文简介（255字符以内）" maxlength="255" />
            </el-form-item>
            <el-form-item label="英文简介">
              <el-input v-model="form.desc_en" type="textarea" :rows="2" placeholder="English description (max 255 chars)" maxlength="255" />
            </el-form-item>
            <el-form-item label="横幅图片">
              <el-input v-model="form.banner" placeholder="输入图片 URL，如 https://example.com/banner.jpg" />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="form.status">
                <el-option :value="0" label="未开始" />
                <el-option :value="1" label="报名中" />
                <el-option :value="2" label="资格赛" />
                <el-option :value="3" label="正赛中" />
                <el-option :value="4" label="已结束" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="updateInfo">保存修改</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 规则编辑 -->
      <el-tab-pane label="规则" name="rules">
        <el-card shadow="never" v-if="tab === 'rules'">
          <el-form label-width="100px">
            <el-form-item label="中文规则">
              <wangEditor v-model="form.rule_zh" key="rule_zh" />
            </el-form-item>
            <el-form-item label="英文规则">
              <wangEditor v-model="form.rule_en" key="rule_en" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="updateInfo">保存规则</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 队伍审核 -->
      <el-tab-pane label="队伍审核" name="teams">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>队伍列表 ({{ teams.length }})</span>
              <el-button type="success" size="small" @click="approveAll">批量通过</el-button>
            </div>
          </template>
          <el-table :data="teams" stripe>
            <el-table-column label="队伍" min-width="200">
              <template #default="{ row }">
                <div>
                  <strong>{{ row.display_name }}</strong>
                  <div style="font-size: 12px; color: #999;">
                    {{ row.players?.map(p => p.user?.user_name).join(', ') }}
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : row.status === 2 ? 'danger' : 'warning'" size="small">
                  {{ row.status === 0 ? '待审' : row.status === 1 ? '通过' : '拒绝' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" align="center">
              <template #default="{ row }">
                <el-button type="success" size="small" :disabled="row.status === 1" @click="setTeamStatus(row.id, 1)">通过</el-button>
                <el-button type="danger" size="small" :disabled="row.status === 2" @click="setTeamStatus(row.id, 2)">拒绝</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- Staff 管理 -->
      <el-tab-pane label="Staff" name="staff">
        <el-card shadow="never">
          <template #header>
            <el-space>
              <el-input-number v-model="newStaffUserId" placeholder="用户 ID" :min="1" :controls="false" />
              <el-select v-model="newStaffRole" style="width: 120px;">
                <el-option value="referee" label="Referee" />
                <el-option value="pooler" label="Pooler" />
                <el-option value="custom_mapper" label="Custom Mapper" />
                <el-option value="tester" label="Tester" />
                <el-option value="streamer" label="Streamer" />
                <el-option value="commentator" label="Commentator" />
              </el-select>
              <el-button type="primary" @click="addStaffMember">添加</el-button>
            </el-space>
          </template>
          <el-table :data="staff" stripe>
            <el-table-column prop="user.user_name" label="用户" />
            <el-table-column label="角色" width="120">
              <template #default="{ row }">
                <el-tag>{{ row.role }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button type="danger" link @click="removeStaffMember(row.id)">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- 资格赛 -->
      <el-tab-pane label="资格赛" name="qual">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>资格赛图池</span>
            </div>
          </template>
          <el-table :data="qualMaps" stripe>
            <el-table-column prop="index" label="Stage" width="80" />
            <el-table-column prop="title" label="曲名" />
            <el-table-column prop="weight" label="权重" width="100" />
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button type="danger" link @click="deleteQualMapItem(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-divider />
          <el-space wrap style="align-items: flex-end;">
            <el-form-item label="Stage" style="margin-bottom: 0;">
              <el-input-number v-model="newQualMap.index" :min="1" placeholder="1" style="width: 80px;" :controls="false" />
            </el-form-item>
            <el-form-item label="谱面链接" style="margin-bottom: 0; flex: 1;">
              <el-input v-model="newQualMap.url" placeholder="https://osu.ppy.sh/beatmapsets/xxx#mania/xxx" style="width: 400px;" />
            </el-form-item>
            <el-form-item label="权重" style="margin-bottom: 0;">
              <el-input-number v-model="newQualMap.weight" :min="0" :step="0.1" placeholder="1.0" style="width: 80px;" :controls="false" />
            </el-form-item>
            <el-button type="primary" @click="addQualMapItem" :loading="addingMap">添加</el-button>
          </el-space>
        </el-card>

        <!-- 资格赛排名 -->
        <el-card shadow="never" style="margin-top: 16px;">
          <template #header>
            <div class="card-header">
              <span>资格赛排名（仅管理员可见）</span>
              <el-button type="primary" size="small" @click="calculateRank" :loading="calculatingRank">计算排名</el-button>
            </div>
          </template>
          <el-table :data="qualRanking" stripe>
            <el-table-column label="排名" width="80" align="center">
              <template #default="{ row }">
                <el-tag 
                  v-if="row.qual_rank <= 3" 
                  :type="row.qual_rank === 1 ? 'danger' : row.qual_rank === 2 ? 'warning' : ''" 
                  effect="dark"
                  round
                >
                  {{ row.qual_rank }}
                </el-tag>
                <span v-else>{{ row.qual_rank }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="display_name" label="队伍" />
            <el-table-column label="总分" width="140" align="right">
              <template #default="{ row }">
                {{ row.qual_score?.toLocaleString() || 0 }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.qual_rank <= (tournament?.qual_top_n || 32)" type="success" effect="plain">晋级</el-tag>
                <el-tag v-else type="info" effect="plain">淘汰</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!qualRanking.length" description="暂无排名，请先计算" />
        </el-card>
      </el-tab-pane>

      <!-- 轮次 -->
      <el-tab-pane label="轮次" name="rounds">
        <el-card shadow="never">
          <el-table :data="rounds" stripe>
            <el-table-column prop="name" label="轮次名" />
            <el-table-column label="组别" width="100">
              <template #default="{ row }">
                <el-tag :type="row.bracket_type === 0 ? 'primary' : 'warning'">
                  {{ row.bracket_type === 0 ? '胜者组' : '败者组' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="BO" width="80">
              <template #default="{ row }">BO{{ (row.first_to * 2) - 1 }}</template>
            </el-table-column>
          </el-table>
          <el-divider />
          <el-space wrap>
            <el-input v-model="newRound.name" placeholder="轮次名" style="width: 120px;" />
            <el-select v-model="newRound.bracket_type" style="width: 100px;">
              <el-option :value="0" label="胜者组" />
              <el-option :value="1" label="败者组" />
            </el-select>
            <el-input-number v-model="newRound.first_to" :min="1" placeholder="First To" style="width: 100px;" :controls="false" />
            <el-input-number v-model="newRound.order" :min="1" placeholder="顺序" style="width: 80px;" :controls="false" />
            <el-button type="primary" @click="addRoundItem">添加</el-button>
          </el-space>
        </el-card>
      </el-tab-pane>

      <!-- 比赛 -->
      <el-tab-pane label="比赛" name="matches">
        <el-card shadow="never">
          <el-table :data="matches" stripe>
            <el-table-column label="轮次" width="120">
              <template #default="{ row }">{{ row.round?.name }}</template>
            </el-table-column>
            <el-table-column label="对阵" min-width="200">
              <template #default="{ row }">
                {{ row.team1?.display_name }} vs {{ row.team2?.display_name }}
              </template>
            </el-table-column>
            <el-table-column label="比分" width="100" align="center">
              <template #default="{ row }">{{ row.team1_score }} - {{ row.team2_score }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="center">
              <template #default="{ row }">
                <el-button type="primary" link @click="router.push(`/t/${props.tid}/referee/${row.id}`)">裁判</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  getTournament, updateTournament, getTeams, updateTeamStatus, approveAllTeams,
  getStaff, addStaff, removeStaff, getQualMappool, addQualMap, deleteQualMap, calculateRanking,
  getRounds, createRound, getBracket, getQualRanking
} from '@/api/tournament'
import { ElMessage } from 'element-plus'
import wangEditor from '@/components/wangEditor.vue'

const props = defineProps({
  tid: { type: [String, Number], required: true }
})

const router = useRouter()

// 响应式状态
const tournament = ref(null)
const tab = ref('info')
const form = reactive({})
const teams = ref([])
const staff = ref([])
const qualMaps = ref([])
const rounds = ref([])
const matches = ref([])

const newStaffUserId = ref(null)
const newStaffRole = ref('referee')
const newQualMap = reactive({ index: null, url: '', weight: null })
const newRound = reactive({ name: '', bracket_type: 0, first_to: null, order: null })
const addingMap = ref(false)
const qualRanking = ref([])
const calculatingRank = ref(false)

// 获取所有数据
const fetchAll = async () => {
  const res = await getTournament(props.tid)
  tournament.value = res
  Object.assign(form, res)
  
  const [teamsRes, staffRes, qualRes, roundsRes, bracketRes, rankingRes] = await Promise.all([
    getTeams(props.tid),
    getStaff(props.tid),
    getQualMappool(props.tid),
    getRounds(props.tid),
    getBracket(props.tid),
    getQualRanking(props.tid)
  ])
  teams.value = teamsRes
  staff.value = staffRes
  qualMaps.value = qualRes
  rounds.value = roundsRes
  matches.value = bracketRes
  qualRanking.value = rankingRes
}

// 更新基本信息
const updateInfo = async () => {
  try {
    await updateTournament(props.tid, form)
    ElMessage.success('保存成功')
  } catch (e) { 
    ElMessage.error('保存失败') 
  }
}

// 队伍状态管理
const setTeamStatus = async (teamId, status) => {
  await updateTeamStatus(props.tid, teamId, status)
  await fetchAll()
}

const approveAll = async () => {
  await approveAllTeams(props.tid)
  ElMessage.success('批量通过完成')
  await fetchAll()
}

// Staff 管理
const addStaffMember = async () => {
  if (!newStaffUserId.value) return
  await addStaff(props.tid, newStaffUserId.value, newStaffRole.value)
  newStaffUserId.value = null
  await fetchAll()
}

const removeStaffMember = async (id) => {
  await removeStaff(props.tid, id)
  await fetchAll()
}

// 资格赛图池管理
const addQualMapItem = async () => {
  if (!newQualMap.url) {
    ElMessage.warning('请输入谱面链接')
    return
  }
  addingMap.value = true
  try {
    await addQualMap(props.tid, newQualMap)
    Object.assign(newQualMap, { index: (newQualMap.index || 0) + 1, url: '', weight: null })
    await fetchAll()
    ElMessage.success('添加成功')
  } catch (error) {
    // 错误已在 axios 拦截器中处理
  } finally {
    addingMap.value = false
  }
}

const deleteQualMapItem = async (id) => {
  await deleteQualMap(props.tid, id)
  await fetchAll()
}

const calculateRank = async () => {
  calculatingRank.value = true
  try {
    await calculateRanking(props.tid)
    // 重新获取排名数据
    const rankingRes = await getQualRanking(props.tid)
    qualRanking.value = rankingRes
    ElMessage.success('排名计算完成')
  } catch (error) {
    // 错误已在 axios 拦截器中处理
  } finally {
    calculatingRank.value = false
  }
}

// 轮次管理
const addRoundItem = async () => {
  await createRound(props.tid, newRound)
  await fetchAll()
}

// 工具函数
const getStatusText = (status) => {
  const map = { 0: '未开始', 1: '报名中', 2: '资格赛', 3: '正赛中', 4: '已结束' }
  return map[status] || '未知'
}

const getStatusType = (status) => {
  const map = { 0: 'info', 1: 'success', 2: 'warning', 3: 'danger', 4: '' }
  return map[status] || 'info'
}

onMounted(() => {
  fetchAll()
})
</script>

<style scoped>
.admin-tournament-detail {
  padding: 20px;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 600;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
