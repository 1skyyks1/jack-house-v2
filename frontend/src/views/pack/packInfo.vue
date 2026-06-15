<template>
  <div>
    <navMenu></navMenu>
    <el-row justify="center">
      <el-col :xs="24" :sm="24" :md="16" :lg="16" :xl="16">
        <el-card v-loading="packLoading" shadow="never">
          <template #header>
            <div class="card-header">
              <div class="pack-header">
                <el-icon><CollectionTag /></el-icon>
                <span>{{ t('pack.info.drawerTitle') }}</span>
              </div>
              <div>
                <el-button class="refresh-pack-btn" circle plain @click="updatePackInfo" :disabled="updateLoading || !packInfo.osu_bid">
                  <el-icon v-if="updateLoading" class="is-loading" size="large"><Loading /></el-icon>
                  <el-icon v-else size="large"><Refresh /></el-icon>
                </el-button>
                <el-button circle plain>
                  <el-icon size="large"><WarnTriangleFilled /></el-icon>
                </el-button>
              </div>
            </div>
          </template>
          <div class="card-body">
            <div class="bg-box" :style="{ backgroundImage: `url(https://assets.ppy.sh/beatmaps/${packInfo.osu_bid}/covers/card@2x.jpg)` }">
              <el-row justify="center" class="pack-info-wrapper">
                <el-col :xs="24" :sm="24" :md="16" :lg="16" :xl="16">
                  <div class="pack-info">
                    <div class="map-list">
                      <div v-for="map in packInfo.maps" class="map-badge" @mouseenter="hoveredMap = map"
                           @mouseleave="hoveredMap = null" @click="selectedMap = map" :class="{ active: hoveredMap === map || (selectedMap === map && !hoveredMap) }">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            xmlns:svg="http://www.w3.org/2000/svg"
                            viewBox="0 0 700 700"
                            width="24"
                            height="24"
                            xml:space="preserve"
                            id="svg2"
                            version="1.1"
                        ><defs>
    <clipPath id="clipPath18" clipPathUnits="userSpaceOnUse">
      <path id="path16" d="M 0,500 H 500 V 0 H 0 Z" />
    </clipPath>
  </defs>

                          <g transform="matrix(1.3333333,0,0,-1.3333333,0,666.66667)" id="g10">
    <g id="g12">
      <g clip-path="url(#clipPath18)" id="g14">

        <!-- 左柱 -->
        <g transform="translate(250,99)" id="g20">
          <path
              id="path22"
              :fill="osuDifficultyColor(map.rating)"
              style="fill-opacity:1;fill-rule:nonzero;stroke:none"
              d="m 0,0 c -13.807,0 -25,11.193 -25,25 v 252 c 0,13.807 11.193,25 25,25 13.807,0 25,-11.193 25,-25 V 25 C 25,11.193 13.807,0 0,0"
          />
        </g>

        <!-- 中左柱 -->
        <g transform="translate(170,170)" id="g24">
          <path
              id="path26"
              :fill="osuDifficultyColor(map.rating)"
              style="fill-opacity:1;fill-rule:nonzero;stroke:none"
              d="m 0,0 c -13.807,0 -25,11.192 -25,25 v 110 c 0,13.807 11.193,25 25,25 13.807,0 25,-11.193 25,-25 V 25 C 25,11.192 13.807,0 0,0"
          />
        </g>

        <!-- 中右柱 -->
        <g transform="translate(330,170)" id="g28">
          <path
              id="path30"
              :fill="osuDifficultyColor(map.rating)"
              style="fill-opacity:1;fill-rule:nonzero;stroke:none"
              d="m 0,0 c -13.808,0 -25,11.192 -25,25 v 110 c 0,13.807 11.192,25 25,25 13.808,0 25,-11.193 25,-25 V 25 C 25,11.192 13.808,0 0,0"
          />
        </g>

        <!-- 外环 -->
        <g transform="translate(250,485)" id="g32">
          <path
              id="path34"
              :fill="osuDifficultyColor(map.rating)"
              style="fill-opacity:1;fill-rule:nonzero;stroke:none"
              d="m 0,0 c -31.707,0 -62.487,-6.219 -91.485,-18.484 -27.989,-11.838 -53.116,-28.777 -74.685,-50.346 -21.569,-21.569 -38.508,-46.697 -50.346,-74.685 C -228.781,-172.513 -235,-203.293 -235,-235 c 0,-31.707 6.219,-62.487 18.484,-91.484 11.838,-27.99 28.777,-53.117 50.346,-74.686 21.569,-21.569 46.696,-38.508 74.685,-50.347 C -62.487,-463.781 -31.707,-470 0,-470 c 31.707,0 62.487,6.219 91.484,18.483 27.99,11.839 53.117,28.778 74.686,50.347 21.569,21.569 38.508,46.696 50.347,74.686 12.264,28.997 18.483,59.777 18.483,91.484 0,31.707 -6.219,62.487 -18.483,91.485 -11.839,27.988 -28.778,53.116 -50.347,74.685 -21.569,21.569 -46.696,38.508 -74.686,50.346 C 62.487,-6.219 31.707,0 0,0 m 0,-40 c 107.695,0 195,-87.305 195,-195 0,-107.695 -87.305,-195 -195,-195 -107.696,0 -195,87.305 -195,195 0,107.695 87.304,195 195,195"
          />
        </g>

      </g>
    </g>
  </g>
</svg>
                      </div>
                    </div>
                    <div class="map-version-display" :style="{ visibility: (hoveredMap || selectedMap) ? 'visible' : 'hidden' }">
                      {{ (hoveredMap || selectedMap)?.version }}
                      <span :style="{ color: osuDifficultyColor((hoveredMap || selectedMap)?.rating), fontWeight: 'bold' }">
                        {{ '★' + (hoveredMap || selectedMap)?.rating }}
                      </span>
                    </div>
                    <div class="info-left">
                      <div class="title">{{ packInfo.title_unicode }}</div>
                      <div class="artist">{{ packInfo.artist_unicode }}</div>
                      <div class="meta">
                        <div> {{ t('pack.info.by') }} <span class="meta-bold">{{ packInfo.creator }}</span></div>
                        <div> {{ t('pack.info.submitted') }} <span class="meta-bold">{{ formatDate(packInfo.submitted_date) }}</span></div>
                        <div> {{ t('pack.info.updated') }} <span class="meta-bold">{{ formatDate(packInfo.last_updated) }}</span></div>
                      </div>
                    </div>
                    <div class="tag-box">
                      <div class="pack-tag">
                        {{ handleType(packInfo.type) }}
                      </div>
                      <div class="pack-tag" v-for="tag in packInfo.tags" :key="tag.tag_name">
                        {{ tag.tag_id < 8 ? t(`tags.${tag.tag_name}`) : tag.tag_name }}
                      </div>
                    </div>
                  </div>
                </el-col>
                <el-col :xs="24" :sm="24" :md="8" :lg="8" :xl="8" class="map-info-box">
                  <div class="map-info-grid">
                    <div class="info-item-no-flex">
                      <div class="info-item" style="padding: 0">
                        <div class="label">{{ t('pack.info.od') }}</div>
                        <span class="value">{{ selectedMap?.od.toFixed(1) }}</span>
                      </div>
                      <el-progress
                          :stroke-width="4"
                          :percentage="selectedMap?.od * 10"
                          color="#409EFF"
                          style="width: 100%;"
                          :show-text="false">
                      </el-progress>
                    </div>
                    <div class="info-item-no-flex">
                      <div class="info-item" style="padding: 0">
                        <div class="label">{{ t('pack.info.hp') }}</div>
                        <span class="value">{{ selectedMap?.hp.toFixed(1) }}</span>
                      </div>
                      <el-progress
                          :stroke-width="4"
                          :percentage="selectedMap?.hp * 10"
                          color="#f56c6c"
                          style="width: 100%;"
                          :show-text="false">
                      </el-progress>
                    </div>
                    <div class="info-item black-bg-overlay">
                      <div class="label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-star" viewBox="0 0 16 16">
                          <path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z"/>
                        </svg>
                        {{ t('pack.info.rating') }}</div>
                      <div class="value">{{ selectedMap?.rating }}</div>
                    </div>
                    <div class="info-item black-bg-overlay">
                      <div class="label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-music-note-beamed" viewBox="0 0 16 16">
                          <path d="M6 13c0 1.105-1.12 2-2.5 2S1 14.105 1 13s1.12-2 2.5-2 2.5.896 2.5 2m9-2c0 1.105-1.12 2-2.5 2s-2.5-.895-2.5-2 1.12-2 2.5-2 2.5.895 2.5 2"/>
                          <path fill-rule="evenodd" d="M14 11V2h1v9zM6 3v10H5V3z"/>
                          <path d="M5 2.905a1 1 0 0 1 .9-.995l8-.8a1 1 0 0 1 1.1.995V3L5 4z"/>
                        </svg>
                        {{ t('pack.info.bpm') }}</div>
                      <div class="value">{{ selectedMap?.bpm }}</div>
                    </div>
                    <div class="info-item black-bg-overlay">
                      <div class="label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-music-note-list" viewBox="0 0 16 16">
                          <path d="M12 13c0 1.105-1.12 2-2.5 2S7 14.105 7 13s1.12-2 2.5-2 2.5.895 2.5 2"/>
                          <path fill-rule="evenodd" d="M12 3v10h-1V3z"/>
                          <path d="M11 2.82a1 1 0 0 1 .804-.98l3-.6A1 1 0 0 1 16 2.22V4l-5 1z"/>
                          <path fill-rule="evenodd" d="M0 11.5a.5.5 0 0 1 .5-.5H4a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5m0-4A.5.5 0 0 1 .5 7H8a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5m0-4A.5.5 0 0 1 .5 3H8a.5.5 0 0 1 0 1H.5a.5.5 0 0 1-.5-.5"/>
                        </svg>
                        {{ t('pack.info.length') }}</div>
                      <div class="value">{{ formatTime(selectedMap?.length) }}</div>
                    </div>
                    <div class="info-item black-bg-overlay">
                      <div class="label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-play-circle" viewBox="0 0 16 16">
                          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
                          <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445"/>
                        </svg>
                        {{ t('pack.info.realLength') }}</div>
                      <div class="value">{{ formatTime(selectedMap?.real_length) }}</div>
                    </div>
                    <div class="info-item black-bg-overlay">
                      <div class="label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-grid" viewBox="0 0 16 16">
                          <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5zM2.5 2a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zm6.5.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5zm6.5.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5z"/>
                        </svg>
                        {{ t('pack.info.rc') }}</div>
                      <div class="value">{{ selectedMap?.key_count }}</div>
                    </div>
                    <div class="info-item black-bg-overlay">
                      <div class="label">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-columns-gap" viewBox="0 0 16 16">
                          <path d="M6 1v3H1V1zM1 0a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1zm14 12v3h-5v-3zm-5-1a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1zM6 8v7H1V8zM1 7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zm14-6v7h-5V1zm-5-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1z"/>
                        </svg>
                        {{ t('pack.info.ln') }}</div>
                      <div class="value">{{ selectedMap?.ln_count }}</div>
                    </div>
                  </div>
                  <div class="btn-grid">
                    <div class="btn">
                      <el-button type="info" plain @click.stop="goToPackLink(0, packInfo.osu_bid)">
                        <div class="btn-label">
                          <img class="dl-icon" alt="osu" src="../../assets/pic/osu/osuLogo.png" width="22" height="22">
                          {{ t('pack.info.osu') }}
                        </div>
                      </el-button>
                    </div>
                    <div class="btn">
                      <el-button type="info" plain @click.stop="goToPackLink(1, packInfo.osu_bid)">
                        <div class="btn-label">
                          <img class="dl-icon" alt="osu.direct" src="../../assets/pic/osuDirect.svg" width="22" height="22">
                          osu.direct
                        </div>
                      </el-button>
                    </div>
                    <div class="btn-after">
                      <el-button type="info" plain @click.stop="goToPackLink(2, packInfo.osu_bid)">
                        <div class="btn-label">
                          <img class="dl-icon" alt="Sayobot" src="../../assets/pic/sayobot.ico" width="19" height="19">
                          Sayobot
                        </div>
                      </el-button>
                    </div>
                    <div class="btn-after">
                      <el-button type="info" plain @click.stop="goToPackLink(3, packInfo.osu_bid)">
                        <div class="btn-label">
                          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="currentColor" class="bi bi-cloud-download dl-icon" viewBox="0 0 16 16">
                            <path d="M4.406 1.342A5.53 5.53 0 0 1 8 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 0 1 0-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 0 0-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 0 1 0 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383"/>
                            <path d="M7.646 15.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 14.293V5.5a.5.5 0 0 0-1 0v8.793l-2.146-2.147a.5.5 0 0 0-.708.708z"/>
                          </svg>
                          NeriNyan
                        </div>
                      </el-button>
                    </div>
                  </div>
                </el-col>
              </el-row>
            </div>
          </div>
        </el-card>
        <el-card shadow="never" style="margin: 8px 0">
          <template #header>
            <div class="card-header">
              <div class="pack-header">
                <el-icon><ChatDotRound /></el-icon>
                <span>{{ t('pack.info.comments') }}</span>
              </div>
            </div>
          </template>
          <div class="comments">
            <div class="comment-form">
              <el-input
                  type="textarea"
                  :rows="2"
                  v-model="newComment"
                  :placeholder="t('pack.info.com.placeholder')"
              ></el-input>
              <div style="display: flex; justify-content: right">
                <el-button type="success" plain size="small" style="margin-top: 10px;" @click="createComment">{{ t('pack.info.com.createComment') }}</el-button>
              </div>
            </div>
            <el-divider class="comment-divider"></el-divider>
            <div class="comment-list">
              <div v-for="comment in comments" :key="comment.id">
                <div class="comment-item">
                  <div class="comment-user">
                    <el-avatar shape="square" :src="comment.avatar"></el-avatar>
                    <span>{{ comment.user_name }}</span>
                    <el-divider direction="vertical" style="height: 100%"/>
                  </div>
                  <div class="comment-content">{{ comment.content }}</div>
                  <div class="bottom">
                    <el-button text class="delete" v-if="String(comment.user_id) === String(userId)" @click="deletePackComment(comment.comment_id)">{{ t('pack.info.com.deleteComment') }}</el-button>
                    <div class="comment-time">{{ formatDate(comment.created_time) }}</div>
                  </div>
                </div>
                <el-divider class="comment-divider"></el-divider>
              </div>
            </div>
            <el-pagination
                style="margin-top: 10px; justify-content: center"
                background
                layout="prev, pager, next"
                :page-size="commentPageSize"
                :total="totalComments"
                @current-change="handleCommentPageChange"
                hide-on-single-page
            ></el-pagination>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import navMenu from '@/components/navmenu.vue'
import { useRoute } from "vue-router";
import { WarnTriangleFilled, CollectionTag, ChatDotRound, Refresh, Loading } from "@element-plus/icons-vue";
import { computed, onBeforeMount, reactive, ref } from "vue";
import { useI18n } from 'vue-i18n';
import { packById, updatePackFromOsu } from '@/api/pack.js'
import { packCommentDelete, packCommentList, packCommentCreate } from '@/api/packComment.js'
import { dayjs, ElMessage } from "element-plus";
import { useBreakpoints } from "@vueuse/core";
import { useStore } from "vuex";

const route = useRoute()
const { t } = useI18n();
const store = useStore()

const userId = computed(() => store.state.userId);

const packId = route.params.pack_id;
const packLoading = ref(true);
const packInfo = reactive({})
const hoveredMap = ref(null)
const selectedMap = ref(null)
const newComment = ref('')
const comments = ref([])
const commentPageSize = ref(3)
const commentPage = ref(1)
const totalComments = ref(0)
const commentLoading = ref(false)
const updateLoading = ref(false)

const breakpoints = useBreakpoints({
  tablet: 768,
  laptop: 992,
  desktop: 1200,
});

const isDesktop = breakpoints.greater('desktop');

const formatDate = (dateString) => {
  return dayjs(dateString).format('YYYY-MM-DD');
}

const osuDifficultyColor = (difficulty) => {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const d = clamp(difficulty, 1, 8); // 限制在1~8

  const segments = [
    { value: 1, color: '#2558fa' },
    { value: 2, color: '#4bfaa1' },
    { value: 3, color: '#FFFF00' },
    { value: 4, color: '#FF8000' },
    { value: 5, color: '#FF0000' },
    { value: 6, color: '#ff00a6' },
    { value: 7, color: '#b062ff' },
    { value: 8, color: '#8f39fd' },
    { value: 9, color: '#6f00ff' },
  ];

  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ];
  };

  const rgbToHex = (r, g, b) =>
      '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

  for (let i = 0; i < segments.length - 1; i++) {
    if (d >= segments[i].value && d <= segments[i + 1].value) {
      const start = hexToRgb(segments[i].color);
      const end = hexToRgb(segments[i + 1].color);
      const t = (d - segments[i].value) / (segments[i + 1].value - segments[i].value);
      const r = Math.round(start[0] + (end[0] - start[0]) * t);
      const g = Math.round(start[1] + (end[1] - start[1]) * t);
      const b = Math.round(start[2] + (end[2] - start[2]) * t);
      return rgbToHex(r, g, b);
    }
  }

  return segments[segments.length - 1].color;
};

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // 秒数始终显示两位数
  const formattedSeconds = seconds.toString().padStart(2, '0');
  return `${minutes}:${formattedSeconds}`;
}

const handleType = (type) => {
  switch (type) {
    case 0:
      return t('pack.practice')
    case 1:
      return t('pack.collection')
    case 2:
      return t('pack.dan')
    case 3:
      return t('pack.single')
  }
}

const getPackLink = (type, bid) => {
  switch (type) {
    case 0:
      return `https://osu.ppy.sh/beatmapsets/${bid}`;
    case 1:
      return `https://osu.direct/api/d/${bid}`;
    case 2:
      return `https://txy1.sayobot.cn/beatmaps/download/novideo/${bid}`;
    case 3:
      return `https://api.nerinyan.moe/d/${bid}`
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

const getPackInfo = async () => {
  packLoading.value = true
  try {
    const res = await packById(packId)
    Object.assign(packInfo, res.data)
    packInfo.maps.sort((a, b) => a.rating - b.rating)
    if (packInfo.maps && packInfo.maps.length > 0) {
      selectedMap.value = packInfo.maps[0]
    }
  } finally {
    packLoading.value = false
  }
}

const isUpdatedToday = (updatedTime) => {
  if (!updatedTime) return false
  return dayjs(updatedTime).isSame(dayjs(), 'day')
}

const updatePackInfo = async () => {
  if (isUpdatedToday(packInfo.updated_time)) {
    ElMessage.warning(t('pack.info.updateLimited'))
    return
  }

  updateLoading.value = true
  try {
    await updatePackFromOsu(packInfo.osu_bid)
    await getPackInfo()
    ElMessage.success(t('pack.info.updateSuccess'))
  } catch (error) {
  } finally {
    updateLoading.value = false
  }
}

const getCommentsByPackId = async () => {
  commentLoading.value = true
  try {
    const res = await packCommentList(commentPage.value, commentPageSize.value, packId)
    comments.value = res.data;
    totalComments.value = res.total;
    commentLoading.value = false;
  } catch (error) {
    commentLoading.value = false;
  }
}

const createComment = () => {
  let comment = {
    pack_id: packId,
    content: newComment.value
  }
  packCommentCreate(comment).then(() => {
    ElMessage.success(t('pack.info.com.postSuccess'))
    newComment.value = ''
    getCommentsByPackId()
  })
}

const deletePackComment = (commentId) => {
  packCommentDelete(commentId).then(() => {
    ElMessage.success(t('pack.info.com.deleteCommentSuccess'))
    getCommentsByPackId()
  })
}

const handleCommentPageChange = (page) => {
  commentPage.value = page;
  getCommentsByPackId();
}

onBeforeMount(() => {
  getPackInfo();
  getCommentsByPackId();
})
</script>

<style scoped>
:deep(.el-card .el-card__header){
  padding: 1vh 15px;
}
.card-header{
  display: flex;
  justify-content: space-between;
}
.pack-header{
  display: flex;
  align-items: center;
  gap: 6px;
}
.refresh-pack-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.refresh-pack-btn :deep(.el-icon.is-loading) {
  margin: 0;
}
.el-card :deep(.el-card__body) {
  padding: 0;
}
.bg-box {
  min-height: 350px;
  background: no-repeat center;
  background-size: cover;
  position: relative;
  display: flex;
  flex-direction: column;
}
.bg-box::after {
  background: rgba(0, 0, 0, 0.5);
  position: absolute;
  inset: 0;
  content: "";
  z-index: 0;
}
.pack-info-wrapper {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  padding: 0;
  color: #fff;
}
.pack-info {
  margin: 3% 4%;
  height: 100%;
  z-index: 1;
  color: #fff;
  display: flex;
  flex-direction: column;
}
.map-info-box {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
}
.map-info-grid {
  display: grid;
  width: 100%;
  margin-top: 4%;
  padding: 0 4%;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 4px;
}
.btn-grid {
  display: grid;
  width: 100%;
  margin: 4% 0;
  padding: 0 4%;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 4px;
}
.info-item-no-flex {
  padding: 4px 8px;
  border-radius: 4px;
  cursor: default;
  background: rgba(0, 0, 0, 0.5);
}
.info-item-no-flex .label {
  font-size: 12px;
}
.info-item-no-flex .value {
  font-size: 12px;
}
.info-item-no-flex .el-progress {
  width: 100%;
  margin-top: 3px;
}
.info-item-no-flex .el-progress :deep(.el-progress__text) {
  margin: 0 2px;
}
.info-item-no-flex .el-progress :deep(.el-progress-bar__outer) {
  background-color: rgba(0, 0, 0, 0.8);
  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
}
.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: default;
}
.black-bg-overlay {
  background: rgba(0, 0, 0, 0.5);
}
.info-item .label {
  font-size: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
}
.info-item .value {
  font-size: 12px;
}
.btn {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 1px;
  border-radius: 4px;
  font-size: 12px;
  height: 32px
}
.btn-after {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 1px;
  border-radius: 4px;
  height: 32px
}
.btn .el-button {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
}
.btn-after .el-button {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
}
.btn-label {
  font-size: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  color: #fff;
}
.map-list {
  display: flex;
  flex-direction: row;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  color: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  font-size: 13px;
  flex-wrap: wrap;
  width: fit-content;
  justify-content: flex-start;
}
.map-badge {
  border-radius: 4px;
  height: 34px;
  width: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px 0 4px;
}
.map-badge.active {
  border: 1px solid rgba(255, 255, 255, 0.5);
}
.map-version-display {
  font-size: 13px;
  color: #fff;
  height: 13px;
  margin-top: 4px;
  margin-bottom: 16px;
}
.info-left .title {
  font-weight: bold;
  font-size: 30px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, .75);
}
.info-left .artist {
  font-weight: bold;
  font-size: 20px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, .75);
}
.info-left .meta {
  margin: 24px 0 18px;
  font-size: 14px;
}
.info-left .meta .meta-bold{
  font-weight: bold;
  font-size: 14px;
}
.tag-box {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 30px;
  margin-right: 3%;
}
.pack-tag {
  background: rgba(0, 0, 0, 0.5);
  padding: 4px 8px;
  border-radius: 4px;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  flex-direction: column;
  gap: 8px;
  display: inline-block;
  width: auto;
  font-size: 13px;
}
.comments {
  padding: 10px;
}
.comment-divider{
  margin: 8px 0 8px;
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
@supports (-webkit-overflow-scrolling: touch) {
  .info-left .title {
    text-shadow: none;
  }
  .info-left .artist {
    text-shadow: none;
  }
}
</style>
