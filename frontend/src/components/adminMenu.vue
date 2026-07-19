<template>
  <el-menu router
           :default-active="route.name"
           mode="vertical"
           class="admin-menu"
           :ellipsis="false">
    <el-menu-item v-for="item in visibleMenuItems" :key="item.index" :index="item.index" :route="item.route">
      <el-icon><component :is="item.icon" /></el-icon>
      <span>{{ item.label }}</span>
    </el-menu-item>
  </el-menu>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useStore } from "vuex";
import { Odometer, Bell, User, ChatLineSquare, DocumentChecked, Aim, Medal, Trophy } from "@element-plus/icons-vue"
import { hasAdminPermission } from "@/utils/permissions"

const route = useRoute();
const store = useStore();

// 所有菜单项配置
const menuItems = [
  { index: 'dashboard', route: '/admin/dashboard', icon: Odometer, label: '仪表盘' },
  { index: 'announcement', route: '/admin/announcement', icon: Bell, label: '公告管理' },
  { index: 'users', route: '/admin/users', icon: User, label: '用户管理' },
  { index: 'posts', route: '/admin/posts', icon: ChatLineSquare, label: '帖子管理' },
  { index: 'postFiles', route: '/admin/postFiles', icon: DocumentChecked, label: '投稿审核' },
  { index: 'events', route: '/admin/events', icon: Aim, label: '活动管理' },
  { index: 'badges', route: '/admin/badges', icon: Medal, label: '牌子发放' },
  { index: 'adminTournamentList', route: '/admin/tournament', icon: Trophy, label: '赛事管理' },
]

// 根据权限过滤可见菜单项
const visibleMenuItems = computed(() => {
  return menuItems.filter(item => hasAdminPermission(item.index))
})
</script>

<style scoped>
@media (max-width: 992px) {
  .admin-menu .el-menu-item span{
    display: none;
  }
  .admin-menu .el-menu-item {
    display: flex;
    justify-content: center;
    align-items: center;
    .el-icon{
      margin: 0;
    }
  }
}
@media (max-width: 768px) {
  .admin-menu .el-menu-item{
    padding: 0 !important;
  }
}
</style>
