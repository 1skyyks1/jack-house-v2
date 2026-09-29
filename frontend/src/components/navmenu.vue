<template>
  <el-menu router
           :default-active="route.path"
           mode="horizontal"
           :class="['nav-menu', { 'transparent-nav': isHomePage }]"
           :ellipsis="false">
    <div class="logo">
      <img alt="logo" src="../assets/pic/jackHouseDark.webp" v-if="isHomePage || isDark"/>
      <img alt="logo" src="../assets/pic/jackHouseLight.webp" v-else/>
    </div>
    <div v-if="isMobile" style="">
      <el-menu-item @click="openDrawer">
        <el-icon style="margin: 0"><Menu /></el-icon>
      </el-menu-item>
    </div>
    <div v-else style="display: flex">
      <el-menu-item index="/" class="menu-item">{{ t('menu.home') }}</el-menu-item>
      <el-menu-item index="/forum" class="menu-item">{{ t('menu.forum') }}</el-menu-item>
      <el-menu-item index="/t" class="menu-item">{{ t('menu.tournament') }}</el-menu-item>
      <el-menu-item index="/pack" class="menu-item">{{ t('menu.pack') }}</el-menu-item>
      <el-menu-item index="/about" class="menu-item">{{ t('menu.about') }}</el-menu-item>
      <el-menu-item v-if="!isHomePage">
        <div class="darkModeSvg">
          <svg
              v-if="!isDark"
              @click="toggleDarkMode"
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round">
            <circle cx="12" cy="12" r="5" />
            <path
                d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          </svg>
          <svg
              v-else
              @click="toggleDarkMode"
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </div>
      </el-menu-item>
      <div class="lang-option">
        <lang></lang>
      </div>
      <el-menu-item>
        <el-dropdown>
          <el-avatar shape="square" :src="avatar"/>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                  v-for="(item, index) in dropdownItems"
                  :key="index"
                  :divided="item.divided"
                  @click="item.action && item.action()"
              >
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-menu-item>
    </div>

  </el-menu>

  <el-drawer v-model="drawerVisible" direction="rtl" size="50%">
    <el-menu router
             :default-active="route.path"
             mode="vertical"
             :ellipsis="false"
             :class="[{ 'transparent-nav': isHomePage }]">
      <el-menu-item>
        <el-dropdown>
          <el-avatar shape="square" :src="avatar"/>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                  v-for="(item, index) in dropdownItems"
                  :key="index"
                  :divided="item.divided"
                  @click="item.action && item.action()"
              >
                {{ item.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-menu-item>
      <el-menu-item index="/" class="menu-item">{{ t('menu.home') }}</el-menu-item>
      <el-menu-item index="/forum" class="menu-item">{{ t('menu.forum') }}</el-menu-item>
      <el-menu-item index="/t" class="menu-item">{{ t('menu.tournament') }}</el-menu-item>
      <el-menu-item index="/pack" class="menu-item">{{ t('menu.pack') }}</el-menu-item>
      <el-menu-item index="/about" class="menu-item">{{ t('menu.about') }}</el-menu-item>
    </el-menu>

    <el-divider class="drawer-divider"></el-divider>
    <div class="ver-option">
      <div class="ver-lang-option">
        <lang></lang>
      </div>
      <div class="darkModeSvg ver-svg">
        <svg
            v-if="!isDark"
            @click="toggleDarkMode"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round">
          <circle cx="12" cy="12" r="5" />
          <path
              d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </svg>
        <svg
            v-else
            @click="toggleDarkMode"
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </div>
    </div>
  </el-drawer>

  <el-dialog v-model="showLoginDialog" width="400px" align-center>
    <form class="login-form">
      <div class="flex-column"><label>{{ t('loginDialog.username') }} </label></div>
      <div class="inputForm">
        <el-input v-model="loginForm.username" :placeholder="t('loginDialog.enterUsername')" class="input" :prefix-icon="User"/>
      </div>
      <div class="flex-column"><label>{{ t('loginDialog.password') }} </label></div>
      <div class="inputForm">
        <el-input v-model="loginForm.password" :placeholder="t('loginDialog.enterPassword')" class="input" type="password" show-password :prefix-icon="Lock"/>
      </div>
      <el-button class="submit-button" plain @click="submitLogin">{{ t('loginDialog.login') }}</el-button>
      <el-divider style="margin-bottom: 5px"><span class="else-login">{{ t('loginDialog.elseLogin') }}</span></el-divider>
      <div class="else-login">
        <el-button class="osu-button" @click="osuLogin">
          <img src="../assets/pic/osu/osu.svg" alt="osu!" width="40" />
        </el-button>
      </div>
    </form>
  </el-dialog>
</template>

<script setup>
import { useRoute } from "vue-router";
import { useDark, useToggle, useBreakpoints } from "@vueuse/core";
import { computed, onBeforeMount, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { userById, getPermissions } from "@/api/user"
import { hasAnyAdminPermission } from "@/utils/permissions"
import router from "@/router";
import { useStore } from 'vuex'
import { User, Lock } from '@element-plus/icons-vue'
import { userLogin } from "@/api/login";
import { ElMessage } from "element-plus";
import lang from '../components/lang.vue'
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const route = useRoute();
const isHomePage = computed(() => route.path === '/');
const isDark = useDark();
const toggleDark = useToggle(isDark);
const breakpoints = useBreakpoints({
  mobile: 860,
})
const isMobile = breakpoints.smaller('mobile')
const drawerVisible = ref(false)

const store = useStore();
const isLogged = computed(() => store.state.isLogged);
const userId = computed(() => store.state.userId);
const userName = ref(null)
const avatar = ref(null)
const role = ref(0)
const loginForm = ref({
  username: '',
  password: ''
});

const dropdownItems = computed(() => {
  const items = [];

  if (isLogged.value && userName.value) {
    items.push({ label: userName.value });
  } else {
    items.push({ label: t('menu.login'), action: goLogin });
  }

  if (isLogged.value && userId.value) {
    items.push({ label: t('menu.userInfo'), action: goUserInfo });
  }

  if (isLogged.value) {
    items.push({ label: t('menu.userEdit'), action: goUserEdit });
  }

  if (hasAnyAdminPermission() && isLogged.value) {
    items.push({ label: t('menu.admin'), action: goAdmin });
  }

  if (isLogged.value) {
    items.push({ label: t('menu.logout'), action: goLogout, divided: true });
  }

  return items;
});

const showLoginDialog = computed({
  get: () => store.state.showLoginDialog,
  set: (value) => store.commit('SET_LOGIN_DIALOG', value)
})

const openDrawer = () => {
  drawerVisible.value = true
}

const toggleDarkMode = () => {
  toggleDark();
};

const getUserInfo = async (userId) => {
  try {
    const response = await userById(userId)
    userName.value = response.data.user_name;
    avatar.value = response.data.avatar;
    role.value = response.data.role;
    // 获取权限信息
    if (store.state.adminPermissions.length === 0) {
      const permRes = await getPermissions()
      store.commit('setPermissions', permRes)
    }
  } catch (error) {
    console.error('获取用户信息失败', error)
  }
}

const goLogin = () => {
  store.commit('SET_LOGIN_DIALOG', true)
}

const osuLogin = () => {
  localStorage.setItem('loginRedirect', route.fullPath)
  window.location.href = 'https://api.jackhouse.xyz/auth/osu'
}

const goUserInfo = () => {
  router.push({ path: `/user/${userId.value}` })
}

const goUserEdit = () => {
  router.push({ path: '/user/edit' })
}

const goAdmin = () => {
  router.push(({ path: '/admin/dashboard' }))
}

const submitLogin = async () => {
  try{
    await store.dispatch('Login',
        { identifier: loginForm.value.username,
          password: loginForm.value.password });
    ElMessage.success(t('menu.message.loginSuccess'))
    store.commit('SET_LOGIN_DIALOG', false);
    loginForm.value.username = '';
    loginForm.value.password = '';
  } catch (error) {
    console.log(error)
  }
}

const goLogout = async () => {
  try {
    await store.dispatch('logout');
    ElMessage.success(t('menu.message.logoutSuccess'));
    avatar.value = null;
    userName.value = null;
    role.value = 0;
  }
  catch (error) {
    console.log(error)
  }
}

watch(userId, (newUserId) => {
  if (newUserId) {
    getUserInfo(newUserId);
  }
});

onMounted(() => {
  if(userId.value){
    getUserInfo(userId.value);
  }
})

</script>

<style scoped>
.flex-grow {
  flex-grow: 1;
}
.nav-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  width: 100%;
  display: flex;
  justify-content: space-between;
  backdrop-filter: blur(8px);
  --el-menu-bg-color: transparent;
}
.el-menu--horizontal :deep(.menu-item) {
  font-size: 15px;
}
.el-menu--horizontal :deep(.is-active) {
  font-weight: bold;
}
html.dark .darkModeSvg{
  color: #fff
}
.darkModeSvg{
  color: #000;
  display: flex;
}
.logo{
  padding: 0 15px 0 15px;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 220px;
}
.logo img{
  height: 80%
}
.menu-item{
  padding: 0 30px;
}
.login-form{
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 20px;
}
.submit-button{
  margin: 10px 0 0 0;
}
.else-login{
  display: flex;
  justify-content: center;
}
.osu-button{
  border: none;
  width: 50px;
  height: 50px;
  padding: 0
}
.lang-option{
  margin: 0 10px 1px;
  display: flex;
  align-items: center;
}
.ver-option {
  display: flex;
  align-items: center;
  gap: 20px;
  justify-content: flex-start;
}
.ver-lang-option {
  margin: 10px 0;
}
.el-select{
  margin: 8px
}
.el-drawer{
  z-index: 2000;
}
:deep(.el-drawer .el-drawer__footer){
  text-align: left !important;
}

.nav-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;

  /* 其他页面 */
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--el-border-color-light);
  transition: all 0.3s ease;
}

/* 暗黑模式下的默认状态 */
html.dark .nav-menu {
  background: rgba(30, 30, 30, 0.8);
}

/* 主页透明 */
.nav-menu.transparent-nav {
  background: transparent !important;
  backdrop-filter: none !important;
  border-bottom: none !important;
  box-shadow: none !important;
}

/* 透明模式下的文字颜色处理 */
/* 强制把菜单文字、图标变成白色，并且加一点阴影防止背景太亮看不清 */
.nav-menu.transparent-nav :deep(.el-menu-item),
.nav-menu.transparent-nav :deep(.el-sub-menu__title),
.nav-menu.transparent-nav .dark-mode-svg,
.nav-menu.transparent-nav .login-text {
  color: #ffffff !important;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
}

/* 透明模式下的hover：鼠标放上去变成半透明 */
.nav-menu.transparent-nav :deep(.el-menu-item:hover) {
  background-color: rgba(255,255,255,0.1) !important;
}
</style>
