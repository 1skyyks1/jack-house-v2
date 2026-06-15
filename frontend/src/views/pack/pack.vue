<template>
  <div>
    <navMenu></navMenu>
    <el-row justify="center" :gutter="4" style="margin-bottom: 6px">
      <el-col :xs="18" :sm="18" :md="12" :lg="12" :xl="12">
        <el-input v-model="searchKeyword"
                  :prefix-icon="Search"
                  class="search-input"
                  @input="handleSearchInput"
                  :placeholder="t('pack.searchPlaceholder')"
                  clearable>
        </el-input>
      </el-col>
      <el-col :xs="3" :sm="3" :md="2" :lg="2" :xl="2">
        <el-button size="large" class="create-button" plain @click="showTags = !showTags">
          <el-icon v-if="!showTags" size="large"><ArrowDown /></el-icon>
          <el-icon v-else size="large"><ArrowUp /></el-icon>
          <span v-if="!isMobile">{{ t('pack.tags') }}</span>
        </el-button>
      </el-col>
      <el-col :xs="3" :sm="3" :md="2" :lg="2" :xl="2">
        <el-button size="large" class="create-button" plain @click="goToCreateNewPack">
          <el-icon size="large"><Plus /></el-icon>
          <span v-if="!isMobile">{{ t('pack.add') }}</span>
        </el-button>
      </el-col>
    </el-row>
    <el-row justify="center" style="margin-bottom: 6px; align-items: stretch" :gutter="4" v-show="showTags">
      <el-col :xs="24" :sm="24" :md="12" :lg="14" :xl="14">
        <el-card shadow="never" class="tag-card">
          <div class="tag-box ml-2">
            <el-radio-group v-model="packType" @change="refreshTagsWhenChangeType" text-color="#626aef"
                            fill="rgb(239, 240, 253)">
              <el-radio-button :value="0">{{ t('pack.practice') }}</el-radio-button>
              <el-radio-button :value="1">
                <el-popover placement="bottom-end" :content="t('pack.collectionPopover')">
                  <template #reference>
                    {{ t('pack.collection') }}
                  </template>
                </el-popover>
              </el-radio-button>
              <el-radio-button :value="2">{{ t('pack.dan') }}</el-radio-button>
              <el-radio-button :value="3">
                <el-popover placement="bottom-end" :content="t('pack.singlePopover')">
                  <template #reference>
                    {{ t('pack.single') }}
                  </template>
                </el-popover>
              </el-radio-button>
              <el-radio-button :value="-1">{{ t('pack.all') }}</el-radio-button>
            </el-radio-group>
          </div>
          <div class="tag-box">
            <b>{{ t('pack.pattern') }}</b>
            <el-check-tag v-for="tag in tags.slice(0, 7)" v-model:checked="tag.checked" @change="(checked) => handleTagSelect(tag, checked)" :disabled="packType === 1 || packType === 2">
              {{ t(`tags.${tag.tag_name}`) }}
            </el-check-tag>
          </div>
          <div class="tag-box">
            <b>{{ t('pack.bpm') }}</b>
            <el-check-tag v-for="tag in tags.slice(7, 19)" v-model:checked="tag.checked" @change="(checked) => handleTagSelect(tag, checked)" :disabled="packType === 1 || packType === 2 || packType === 3">{{ tag.tag_name }}</el-check-tag>
          </div>
          <div class="tag-box">
            <b>{{ t('pack.difficulty') }}</b>
            <el-check-tag v-for="tag in tags.slice(19)" v-model:checked="tag.checked" @change="(checked) => handleTagSelect(tag, checked)" :disabled="packType === 1 || packType === 3">{{ tag.tag_name }}</el-check-tag>
          </div>
          <div class="tag-box">
            <b>{{ t('pack.status') }}</b>
            <el-check-tag v-for="tag in status" v-model:checked="tag.checked" @change="(checked) => handleStatusSelect(tag, checked)" :type="tag.type">{{ tag.label }}</el-check-tag>
          </div>
          <div class="tag-box">
            <b>{{ t('pack.byTime') }}</b>
            <el-check-tag v-for="tag in sort" v-model:checked="tag.checked" @change="(checked) => handleSortSelect(tag, checked)">{{ t(tag.label) }}</el-check-tag>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="4" :lg="2" :xl="2" class="button-container">
        <el-row :gutter="6" class="button-group">
          <el-col :span="24">
            <el-button
                size="large"
                class="refresh-button"
                plain
                @click="refreshTags"
            >
              <el-icon size="large"><RefreshLeft /></el-icon>
              <span>{{ t('pack.refresh') }}</span>
            </el-button>
          </el-col>
          <el-col :span="24" v-if="isDesktop">
            <el-button
                size="large"
                class="refresh-button"
                plain
                @click="setUserCol"
            >
              <el-icon v-if="userCol === 8" size="large"><Menu /></el-icon>
              <el-icon v-else size="large"><Grid /></el-icon>
              <span>{{ userCol === 8 ? t('pack.2col') : t('pack.3col') }}</span>
            </el-button>
          </el-col>
        </el-row>
      </el-col>
    </el-row>
    <el-row justify="center">
      <el-col :xs="24" :sm="24" :md="16" :lg="16" :xl="16">
        <el-row justify="start" :gutter="6">
          <el-col :xs="24" :sm="12" :md="12" :lg="userCol" :xl="userCol" v-for="pack in packs" class="pack-col">
            <div class="stage-card" @click="goToPackInfo(pack.pack_id)">
              <div class="stage-bg" :style="{ backgroundImage: `url(https://assets.ppy.sh/beatmaps/${pack.osu_bid}/covers/card@2x.jpg` }"></div>
              <div class="stage-overlay"></div>
              <div class="stage-side-panel">
                <div class="panel-icon" @click.stop="goToPackLink(0, pack.osu_bid)">
                  <el-tooltip
                      effect="dark"
                      content="osu!"
                      placement="top-end"
                  >
                    <img class="dl-icon" alt="osu" src="../../assets/pic/osu/osuLogo.png" width="22" height="22">
                  </el-tooltip>
                </div>
                <div class="panel-icon" @click.stop="goToPackLink(1, pack.osu_bid)">
                  <el-tooltip
                      effect="dark"
                      content="osu.direct"
                      placement="top-start"
                  >
                    <img class="dl-icon" alt="osu.direct" src="../../assets/pic/osuDirect.svg" width="22" height="22">
                  </el-tooltip>
                </div>
                <div class="panel-icon" @click.stop="goToPackLink(2, pack.osu_bid)">
                  <el-tooltip
                      effect="dark"
                      content="Sayobot"
                      placement="bottom-end"
                  >
                    <img class="dl-icon" alt="Sayobot" src="../../assets/pic/sayobot.ico" width="19" height="19">
                  </el-tooltip>
                </div>
                <div class="panel-icon" @click.stop="goToPackLink(3, pack.osu_bid)">
                  <el-tooltip
                      effect="dark"
                      content="NeriNyan"
                      placement="bottom-start"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="currentColor" class="bi bi-cloud-download dl-icon" viewBox="0 0 16 16">
                      <path d="M4.406 1.342A5.53 5.53 0 0 1 8 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 0 1 0-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 0 0-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 0 1 0 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383"/>
                      <path d="M7.646 15.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 14.293V5.5a.5.5 0 0 0-1 0v8.793l-2.146-2.147a.5.5 0 0 0-.708.708z"/>
                    </svg>
                  </el-tooltip>
                </div>
              </div>
              <div class="stage-info">
                <div>
                  <div class="stage-title">
                    <span v-if="pack.type === 3">{{ pack.artist_unicode }} - </span>
                    {{ pack.title_unicode }}
                  </div>
                  <div class="stage-mapper">Mapped by {{ pack.creator }}</div>
                </div>
                <div class="stage-status">
                  <el-tag
                      :type="getRankStatusTag(pack.status).type"
                      size="small"
                      effect="plain"
                      class="post-tag"
                  >
                    {{ getRankStatusTag(pack.status).text }}
                  </el-tag>
                </div>
              </div>
            </div>
          </el-col>
        </el-row>
        <el-pagination
            style="margin: 10px 0 20px; justify-content: center"
            background
            layout="prev, pager, next"
            :current-page="page"
            :page-size="pageSize"
            :total="totalPage"
            @current-change="handlePageChange"
            hide-on-single-page
        />
      </el-col>
    </el-row>
    <div class="floating-btn-group">
      <el-button class="fixed-btn" @click="goToMapSetHelp" type="warning">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-question-circle" viewBox="0 0 16 16">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
          <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286m1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94"/>
        </svg>
      </el-button>
    </div>
  </div>
</template>

<script setup>
import navMenu from "@/components/navmenu.vue";
import { Plus, Search, RefreshLeft, ArrowDown, ArrowUp, Menu, Grid } from "@element-plus/icons-vue";
import { onBeforeMount, ref, computed } from "vue";
import { useI18n } from 'vue-i18n';
import { packList } from "@/api/pack"
import { tagList } from "@/api/tag"
import { debounce } from "lodash";
import { ElMessage } from "element-plus";
import { useBreakpoints } from '@vueuse/core';
import router from "@/router/index.js";
import { useStore } from "vuex";

const { t } = useI18n();
const store = useStore()

const userId = computed(() => store.state.userId);
const totalPage = ref(0)
const packs = ref([]);
const tableLoading = ref(false)
const showTags = ref(true)
const userCol = ref(12)
const searchKeyword = ref('')
const page = ref(1)
const pageSize = ref(12)
const packType = ref(-1)
const tags = ref([])
const status = ref([{ val: 1, label: 'Ranked', checked: false, type: 'success' },
  { val: 4, label: 'Loved', checked: false, type: 'error' }])
const sort = ref([
  { val: 1, label: 'pack.oldestFirst', checked: false },
  { val: 2, label: 'pack.newestFirst', checked: false }
])


const breakpoints = useBreakpoints({
  tablet: 768,
  laptop: 992,
  desktop: 1200,
});

const isMobile = breakpoints.smaller('tablet');
const isTablet = breakpoints.between('tablet', 'laptop');
const isDesktop = breakpoints.greater('desktop');


const getPackList = () => {
  tableLoading.value = true;
  let type = null;
  if(packType.value !== -1){
    type = packType.value;
  }
  let ranked = status.value[0].checked ? 1 : undefined;
  let loved = status.value[1].checked ? 1 : undefined;
  let sortVal = (sort.value.find(tag => tag.checked) || {}).val || 0;
  packList(page.value, pageSize.value, searchKeyword.value, getCheckedTagIds(tags.value), type, ranked, loved, sortVal).then((res) => {
    packs.value = res.data;
    totalPage.value = res.total;
    tableLoading.value = false;
  }).catch(err => {
    ElMessage.error(err)
    tableLoading.value = false;
  })
}

function getCheckedTagIds(tagsArray) {
  return tagsArray.filter(tag => tag.checked).map(tag => tag.tag_id);
}

const getTagList = async () => {
  await tagList().then((res) => {
    const tagData = res.data.map(tag => ({
      ...tag,
      checked: false
    }));
    tags.value = JSON.parse(JSON.stringify(tagData));
  })
}

const debouncedSearch = debounce(() => {
  page.value = 1;
  getPackList();
}, 1000);

const handleTagSelect = (tag, checked) => {
  tag.checked = checked;
  const checkedTagIds = tags.value.filter(tag => tag.checked).map(tag => tag.tag_id);
  store.commit('setPackFilters', {
    ...store.state.packFilters,
    checkedTagIds
  });
  debouncedSearch();
}

const handleStatusSelect = (tag, checked) => {
  tag.checked = checked;
  const checkedStatusIds = status.value.filter(tag => tag.checked).map(tag => tag.val);
  store.commit('setPackFilters', {
    ...store.state.packFilters,
    checkedStatus: checkedStatusIds,
  });
  debouncedSearch();
}

const handleSortSelect = (tag, checked) => {
  if (checked) {
    sort.value.forEach(item => {
      if (item !== tag) item.checked = false
    })
    tag.checked = true
  } else {
    tag.checked = false
  }
  const checkedSortId = (sort.value.find(tag => tag.checked) || { val: 0 }).val;
  store.commit('setPackFilters', {
    ...store.state.packFilters,
    sort: checkedSortId,
  });
  debouncedSearch();
}

const debouncedUpdateKeyWordFilters = debounce(() => {
  store.commit('setPackFilters', {
    ...store.state.packFilters,
    searchKeyword: searchKeyword.value,
  });
}, 1000);

const handleSearchInput = () => {
  debouncedSearch();
  debouncedUpdateKeyWordFilters();
}

const refreshTags = () => {
  tags.value.forEach((tag) => {
    tag.checked = false;
  })
  status.value.forEach(tag => {
    tag.checked = false;
  })
  sort.value.forEach(tag => {
    tag.checked = false;
  })
  packType.value = -1;
  searchKeyword.value = '';
  store.commit('setPackFilters', {
    searchKeyword: '',
    packType: -1,
    checkedTags: [],
    checkedStatus: [],
    sort: 0
  });
  debouncedSearch();
  ElMessage.success(t('pack.refreshSuccess'))
}

const debouncedUpdateTypeFilters = debounce(() => {
  store.commit('setPackFilters', {
    ...store.state.packFilters,
    packType: packType.value,
  });
}, 1000);

const refreshTagsWhenChangeType = () => {
  let rangeStart = 0
  let rangeEnd = tags.value.length

  if (packType.value === 1) {
    rangeStart = 0
  } else if (packType.value === 2) {
    rangeStart = 0
    rangeEnd = 19
  }
  tags.value.slice(rangeStart, rangeEnd).forEach(tag => {
    tag.checked = false
  })
  debouncedSearch()
  debouncedUpdateTypeFilters()
}

const debouncedUpdatePageFilters = debounce(() => {
  store.commit('setPackFilters', {
    ...store.state.packFilters,
    page: page.value,
  });
}, 1000);

const handlePageChange = (packPage) => {
  page.value = packPage;
  debouncedUpdatePageFilters();
  getPackList();
}

const goToCreateNewPack = () => {
  router.push({ path: '/newPack' })
}

const goToPackInfo = (packId) => {
  router.push({ path: `/pack/${packId}` })
}

const setUserCol = () => {
  userCol.value = userCol.value === 12 ? 8 : 12
  pageSize.value = userCol.value === 12 ? 12 : 18
  page.value = 1;
  getPackList();
}

const getRankStatusTag = (status) => {
  switch (status) {
    case -2:
      return { text: 'Graveyard', type: 'info' };
    case -1:
      return { text: 'WIP', type: 'warning' };
    case 0:
      return { text: 'Pending', type: 'danger' };
    case 1:
      return { text: 'Ranked', type: 'success' };
    case 2:
      return { text: 'Approved', type: 'success' };
    case 3:
      return { text: 'Qualified', type: 'success' };
    case 4:
      return { text: '❤', type: 'danger' };
    default:
      return { text: 'Unknown', type: 'info' };
  }
};

const getPackLink = (type, bid) => {
  switch (type) {
    case 0:
      return `https://osu.ppy.sh/beatmapsets/${bid}`;
    case 1:
      return `https://osu.direct/api/d/${bid}`;
    case 2:
      return `https://txy1.sayobot.cn/beatmaps/download/novideo/${bid}`;
    case 3:
      return `https://api.nerinyan.moe/v2/d/${bid}`
    default:
      return '#';
  }
}

const goToPackLink = (type, bid) => {
  const url = getPackLink(type, bid);
  if (url !== '#') {
    window.open(url);
  }
}

const initFiltersFromVuex = () => {
  const savedFilters = store.state.packFilters;
  if (savedFilters.checkedTagIds && tags.value.length) {
    tags.value.forEach(tag => {
      tag.checked = savedFilters.checkedTagIds.includes(tag.tag_id);
    });
  }
  searchKeyword.value = savedFilters.searchKeyword ?? '';
  page.value = savedFilters.page ?? 1
  packType.value = savedFilters.packType ?? -1;
  status.value.forEach((sTag) => {
    sTag.checked = savedFilters.checkedStatus
        ? savedFilters.checkedStatus.includes(sTag.val)
        : false;
  });
  if(savedFilters.sort !== 0) {
    sort.value.find(tag => tag.val === savedFilters.sort).checked = true
  }
}

const goToMapSetHelp = () => {
  router.push({ path: '/post/19' })
}

const scrollToTop = () => {
  document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
}

onBeforeMount(async () => {
  await getTagList();
  initFiltersFromVuex()
  getPackList();
})
</script>


<style scoped>
:deep(.el-input .el-input__wrapper){
  height: 38px;
  border-radius: 7px;
  margin-top: 1px;
}
:deep(.el-input .el-input__inner){
  padding: 0 6px;
}
:deep(.el-input .el-input__suffix){
  padding-right: 6px;
}
.create-button{
  border-radius: 6px;
  width: 100%;
}
.refresh-button{
  border-radius: 6px;
  width: 100%;
  height: 100%;
}
.refresh-card :deep(.el-card__body){
  height: 100%;
}
.tag-box{
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 10px;
  &:last-child{
    margin-bottom: 0;
  }
}
.el-card :deep(.el-card__body){
  padding: 12px 12px !important;
}
.el-form{
  margin: 0 10px;
}
.el-form :deep(.el-form-item){
  margin-bottom: 14px;
}
.el-form :deep(.el-form-item__label){
  margin-bottom: 6px;
}
.el-collapse {
  margin-bottom: 10px;
}
.el-collapse :deep(.el-collapse-item__title){
  font-size: 14px;
}
.icon{
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  img, .el-icon{
    cursor: pointer;
    vertical-align: middle;
    &:hover{
      transform: scale(1.15);
      transition: all 0.2s ease-in-out;
    }
  }
}
.el-divider{
  margin-top: 8px;
}
.comment-divider{
  margin-bottom: 10px;
}
.comment-list {
  margin-top: 5px;
}
.comment-item {
  margin-bottom: 10px;
  padding: 5px;
  display: flex;
  position: relative;
}
.comment-user {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.comment-content {
  margin-left: 10px;
  font-size: 14px;
  overflow-wrap: break-word;
  word-break: break-word;
}
.comment-time {
  font-size: 12px;
  color: #999;
}
.bottom{
  position: absolute;
  right: 10px;
  bottom: 0;
  display: flex;
  justify-content: right;
  align-items: center;
}
.delete{
  font-size: 11px;
  margin: 1px 6px 0;
  padding: 0 6px;
}
.multiline{
  white-space: pre-wrap;
  word-break: break-word;
}
.button-container {
  display: flex;
  flex-direction: column;
}

.button-group {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 2px;
}

.button-group .el-col {
  flex: 1;
  display: flex;
}

:deep(.button-group .el-button) {
  flex: 1;
  width: 100%;
  height: 100% !important;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stage-card {
  position: relative;
  border-radius: 8px;
  margin-bottom: 8px;
  height: 82px;
  overflow: hidden;
  color: #fff;
  cursor: pointer;
  &:hover .stage-bg {
    transform: scale(1.01);
    transition: linear 0.1s;
  }
}
.stage-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  z-index: 0;
}
.stage-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to right,  rgba(0,0,0,0.7), rgba(0,0,0,0.5), rgba(0,0,0,0.3));
  transition: background 1s ease-in-out;
  z-index: 1;
}
.stage-card:hover .stage-overlay {
  background: linear-gradient(to right,  rgba(0,0,0,0.6), rgba(0,0,0,0.4), rgba(0,0,0,0.2));
}
.stage-card:hover .stage-status {
  display: none;
}
.stage-status .el-tag {
  backdrop-filter: blur(3px);
}
.stage-side-panel {
  position: absolute;
  top: 0;
  right: -20px;
  width: 0;
  height: 100%;
  background: linear-gradient(to right,  rgba(0,0,0,0.2), rgba(0,0,0,0.4), rgba(0,0,0,0.6));
  display: grid;
  grid-template-columns: repeat(2, 35px);
  grid-template-rows: repeat(2, 35px);
  gap: 1px;
  padding: 4px;
  overflow: hidden;
  transition: width 0.2s ease-in-out;
  z-index: 2;
  backdrop-filter: blur(1px);
}
.panel-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
.dl-icon:hover{
  transform: scale(1.2);
  transition: linear 0.1s;
}
.stage-card:hover .stage-side-panel {
  width: 100px;
}
.stage-info {
  position: relative;
  z-index: 1;
  padding: 20px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.stage-info > div:first-child {
  flex: 1;
  min-width: 0;
}
.stage-title {
  font-size: 16px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.stage-mapper {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.el-tag{
  --el-tag-bg-color: transparent;
  --el-color-info: white;
}
.pack-col{
  padding: 0 4px !important;
}
.el-pagination{
  margin-bottom: 8px;
}
.floating-btn-group {
  position: fixed;
  bottom: 8%;
  right: 8%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  z-index: 1000;
}
.fixed-btn {
  padding: 8px;
}
</style>