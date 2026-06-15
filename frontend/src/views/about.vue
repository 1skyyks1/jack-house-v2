<template>
  <div v-cloak>
    <navMenu></navMenu>
    <el-row justify="center">
      <el-col :xs="24" :sm="24" :md="16" :lg="16" :xl="16" style="margin-bottom: 6px">
        <el-divider>{{ t('about.intro') }}</el-divider>
        <div class="prose max-w-none dark:prose-invert ml-4" v-html="t('about.p')"></div>
      </el-col>
    </el-row>
    <el-row justify="center">
      <el-col :xs="24" :sm="24" :md="16" :lg="16" :xl="16">
        <el-divider>{{ t('about.qq') }}</el-divider>
        <el-row :gutter="6">
          <el-col v-for="group in groups" :xs="12" :sm="6" :md="6" :lg="6" :xl="6" style="margin-bottom: 6px">
            <el-card shadow="hover" @click="goToLink(group.link)" class="group">
              <div class="group-card">
                <el-avatar shape="square" :src="group.pic" size="large" style="width: 56px"></el-avatar>
                <div class="group-info">
                  <span class="group-title">{{ group.title }}</span>
                  <div class="group-description">
                    <span>{{ group.desc }}</span>
                  </div>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
        <el-divider>{{ t('about.dc') }}</el-divider>
        <el-row :gutter="6">
          <el-col v-for="server in servers" :xs="12" :sm="6" :md="6" :lg="6" :xl="6" style="margin-bottom: 6px">
            <el-card shadow="hover" @click="goToLink(server.link)" class="group">
              <div class="group-card">
                <el-avatar shape="square" :src="server.pic" size="large" style="width: 56px"></el-avatar>
                <div class="group-info">
                  <span class="group-title">{{ server.title }}</span>
                  <div class="group-description">
                    <span>{{ server.desc }}</span>
                  </div>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
        <el-row style="margin-top: 4rem">
          <el-col style="display: flex; justify-content: center">
            <div style="font-size: 13px">© 2025 JackHouse. All rights reserved. Developed by <a href="https://osu.ppy.sh/users/26030234">yks1</a>.</div>
          </el-col>
        </el-row>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import navMenu from "@/components/navmenu.vue";
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const groups = [
  {
    title: "叠屋1群",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/286a8026e7cdb48f93be5454ec508d45_720.png",
    link: "https://qm.qq.com/q/YH43Qvz48G"
  },
  {
    title: "叠屋2群",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/10cd81aa5ee18a56fc4f57abf285f493_720.png",
    link: "https://qm.qq.com/q/5ONvppOKWc"
  },
  {
    title: "REM Shop!",
    desc: "叠屋周边群",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/shop.jpg",
    link: "https://qm.qq.com/q/TLt8gQrqca"
  },
  {
    title: "JHC",
    desc: "om叠屋杯",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/61cbd092c7136aa5e98a9aa19730bb7a_720.png",
    link: "https://qm.qq.com/q/x8CpVXAB20"
  },
  {
    title: "MJHC",
    desc: "Malody叠屋杯",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/mjhc.jpg",
    link: "https://qm.qq.com/q/PRaI9t6P62"
  },
  // {
  //   title: "AAASETU",
  //   desc: "setu群(R18)",
  //   pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/setu.jpg",
  //   link: "https://qm.qq.com/q/p6WB1o5bMY"
  // },
  {
    title: "叠屋三角洲",
    desc: "三角洲分群",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/sjz.jpg",
    link: "https://qm.qq.com/q/IjR5BlujWE"
  },
  {
    title: "REcodM",
    desc: "CODM群&战队",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/codm.jpg",
    link: "https://qm.qq.com/q/dh4elzESLm"
  },
  {
    title: "MC House",
    desc: "我的世界分群",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/mc.jpg",
    link: "https://qm.qq.com/q/Er1DSoL7sm"
  }
]

const servers = [
  {
    title: "Jack House",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/286a8026e7cdb48f93be5454ec508d45_720.png",
    link: "https://discord.gg/rv4vQ96vBv"
  },
  {
    title: "JHC",
    desc: "osu!mania",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/61cbd092c7136aa5e98a9aa19730bb7a_720.png",
    link: "https://discord.gg/bjKwc4Z2Yw"
  },
  {
    title: "MJHC",
    desc: "Malody JHC",
    pic: "https://pub-1d83badff2eb42d5be2db70eeb6a4b78.r2.dev/mjhc.jpg",
    link: "https://discord.gg/uQhBXZ2Y7s"
  }
]

const goToLink = (link) => {
  window.open(link)
}

</script>

<style scoped>
.el-card {
  cursor: pointer;
}
.group :deep(.el-card__body) {
  padding: 12px;
}
.group-card {
  display: flex;
  align-items: center;
}
.group-card .el-avatar {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
}
.group-info {
  margin-left: 8px;
  overflow: hidden;
}
.group-description {
  font-size: 13px;
}
</style>