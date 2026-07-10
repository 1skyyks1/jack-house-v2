<template>
  <div class="overview" :class="{ 'mobile-view': isMobile }">
    <!-- 时间安排 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="card-header">
          <el-icon><Clock /></el-icon>
          <span>时间安排</span>
        </div>
      </template>
      <div class="schedule-grid">
        <div class="schedule-item" v-if="props.tournament?.reg_start">
          <div class="schedule-label">
            <el-tag type="primary" effect="dark">报名</el-tag>
          </div>
          <div class="schedule-time">
            <span class="date">{{ formatDate(props.tournament.reg_start) }}</span>
            <span class="separator">/</span>
            <span class="date">{{ formatDate(props.tournament.reg_end) }}</span>
          </div>
        </div>
        <div class="schedule-item" v-if="props.tournament?.qual_start">
          <div class="schedule-label">
            <el-tag type="warning" effect="dark">资格赛</el-tag>
          </div>
          <div class="schedule-time">
            <span class="date">{{ formatDate(props.tournament.qual_start) }}</span>
            <span class="separator">/</span>
            <span class="date">{{ formatDate(props.tournament.qual_end) }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 工作人员 -->
    <el-card shadow="never" class="section-card" v-if="props.tournament?.staff?.length">
      <template #header>
        <div class="card-header">
          <el-icon><UserFilled /></el-icon>
          <span>工作人员</span>
        </div>
      </template>
      <div class="staff-grid">
        <div class="staff-card" v-for="s in props.tournament.staff" :key="s.id">
          <el-avatar :size="48" :src="s.user?.avatar" />
          <div class="staff-info">
            <span class="staff-name">{{ s.user?.user_name }}</span>
            <el-tag :type="getRoleType(s.role)" size="small">{{ getRoleName(s.role) }}</el-tag>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 赛事规则 -->
    <el-row :gutter="20" v-if="ruleContent">
      <el-col :xs="24" :sm="24" :md="18" :lg="18" :xl="18">
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-header">
              <el-icon><Document /></el-icon>
              <span>{{ locale === 'zh' ? '赛事规则' : 'Rules' }}</span>
            </div>
          </template>
          <div 
            class="prose max-w-none dark:prose-invert js-toc-content rules-content" 
            ref="rulesContentRef" 
            v-html="ruleContent"
          ></div>
        </el-card>
      </el-col>
      <!-- TOC 目录 仅桌面端显示 -->
      <el-col :xs="0" :sm="0" :md="6" :lg="6" :xl="6">
        <div class="toc-box">
          <div class="toc-title">{{ locale === 'zh' ? '目录' : 'Contents' }}</div>
          <div class="js-toc"></div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Clock, UserFilled, Document } from '@element-plus/icons-vue'
import { useBreakpoints } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import tocbot from 'tocbot'
import 'tocbot/dist/tocbot.css'

const props = defineProps({
  tournament: { type: Object, default: null }
})

const { locale } = useI18n()

// 断点响应式
const breakpoints = useBreakpoints({ tablet: 768, mobile: 480 })
const isMobile = breakpoints.smaller('tablet')
const isSmallMobile = breakpoints.smaller('mobile')

const rulesContentRef = ref(null)

// 根据语言获取规则内容
const ruleContent = computed(() => {
  if (!props.tournament) return ''
  return locale.value === 'zh' 
    ? (props.tournament.rule_zh || props.tournament.rule_en || '') 
    : (props.tournament.rule_en || props.tournament.rule_zh || '')
})

// 格式化日期 (YYYY-MM-DD)
const formatDate = (date) => {
  if (!date) return '-'
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getRoleName = (role) => {
  const map = { host: '主办', pooler: '选图', custom_mapper: 'Custom Mapper', tester: 'Tester', referee: '裁判', streamer: '直播', commentator: '解说' }
  return map[role] || role
}

const getRoleType = (role) => {
  const map = { host: 'danger', pooler: 'success', custom_mapper: 'info', tester: 'info', referee: 'warning', streamer: 'primary', commentator: '' }
  return map[role] || ''
}

// 重建 TOC
async function rebuildToc() {
  await nextTick()
  if (!rulesContentRef.value) return
  
  // 为标题添加 ID
  const headings = rulesContentRef.value.querySelectorAll('h1, h2, h3, h4, h5')
  headings.forEach((h, index) => {
    if (!h.id) {
      h.id = (h.innerText || `header-${index}`).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '') || `heading-${index}`
    }
  })

  tocbot.destroy()
  tocbot.init({
    tocSelector: '.js-toc',
    contentSelector: '.js-toc-content',
    headingSelector: 'h1, h2, h3, h4, h5',
    ignoreSelector: '.js-toc-ignore',
    hasInnerContainers: false,
    linkClass: 'toc-link',
    activeLinkClass: 'is-active-link',
    listClass: 'toc-list',
    listItemClass: 'toc-list-item',
    activeListItemClass: 'is-active-li',
    collapseDepth: 6,
    scrollSmooth: false,
    headingsOffset: 80,
    scrollSmoothOffset: -80,
    scrollContainer: 'body',
    onClick: function(e) {
      e.preventDefault()
      const targetId = e.target.getAttribute('href')?.replace('#', '')
      if (targetId) {
        const targetEl = document.getElementById(targetId)
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
      return false
    }
  })
}

// 监听内容变化重建 TOC
watch(ruleContent, (newValue) => {
  if (newValue) {
    rebuildToc()
  }
})

onMounted(() => {
  if (ruleContent.value) {
    rebuildToc()
  }
})

onBeforeUnmount(() => {
  tocbot.destroy()
})
</script>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-card {
  border-radius: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

/* 时间安排网格 */
.schedule-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.schedule-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.schedule-label {
  min-width: 70px;
}

.schedule-time {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--el-text-color-primary);
}

.schedule-time .date {
  font-weight: 500;
}

.schedule-time .separator {
  color: var(--el-text-color-secondary);
}

/* 工作人员网格 */
.staff-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.75rem;
}

.staff-card {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem;
  background: linear-gradient(135deg, var(--el-fill-color-light) 0%, var(--el-fill-color) 100%);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: default;
}

.staff-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
  border-color: var(--el-color-primary-light-7);
}

.staff-card :deep(.el-avatar) {
  border: 2px solid var(--el-border-color-lighter);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.staff-card:hover :deep(.el-avatar) {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 0 0 3px var(--el-color-primary-light-9);
}

.staff-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.staff-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 规则内容样式 */
.rules-content {
  line-height: 1.8;
}

/* TOC 样式 */
.toc-box {
  position: sticky;
  top: 70px;
  padding: 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.toc-title {
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color);
}

.toc-box :deep(.toc-link) {
  position: relative;
  display: block;
  padding: 4px 0 4px 12px;
  color: var(--el-text-color-regular);
  text-decoration: none;
  font-size: 13px;
  transition: color 0.2s;
}

.toc-box :deep(.toc-link::before) {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  width: 2px;
  height: calc(100% - 8px);
  background-color: var(--el-border-color);
  transition: background-color 0.2s;
}

.toc-box :deep(.toc-link:hover) {
  color: var(--el-color-primary);
}

.toc-box :deep(.is-active-link) {
  color: var(--el-color-primary);
  font-weight: 500;
}

.toc-box :deep(.is-active-link::before) {
  background-color: var(--el-color-primary);
}

.toc-box :deep(.toc-list) {
  list-style: none;
  padding-left: 0;
  margin: 0;
}

.toc-box :deep(.toc-list .toc-list) {
  padding-left: 12px;
}

/* 富文本内容中的标题滚动偏移 */
:deep(.js-toc-content h1),
:deep(.js-toc-content h2),
:deep(.js-toc-content h3),
:deep(.js-toc-content h4),
:deep(.js-toc-content h5) {
  scroll-margin-top: 70px;
}

/* 移动端适配（通过 JS 动态 class 控制） */
.mobile-view .schedule-item {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.mobile-view .staff-grid {
  grid-template-columns: repeat(2, 1fr);
}

.mobile-view .staff-card {
  padding: 0.5rem;
}

.staff-grid.single-column {
  grid-template-columns: 1fr;
}
</style>
