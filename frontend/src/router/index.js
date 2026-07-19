import { createRouter, createWebHistory } from 'vue-router';
import { getPermissions } from "@/api/user.js";
import { hasAdminPermission } from '@/utils/permissions';
import store from '@/store';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'home',
            component: () => import('../views/home.vue')
        },
        {
            path: '/post/:post_id',
            name: 'post',
            component: () => import('../views/post.vue'),
            props: true
        },
        {
            path: '/pack',
            name: 'pack',
            component: () => import('../views/pack/pack.vue'),
        },
        {
            path: '/pack/:pack_id',
            name: 'packInfo',
            component: () => import('../views/pack/packInfo.vue'),
        },
        {
            path: '/newPack',
            name: 'newPack',
            component: () => import('../views/pack/newPack.vue'),
        },
        {
            path: '/user/:user_id',
            name: 'user',
            component: () => import('../views/user.vue')
        },
        {
            path: '/user/edit',
            name: 'userEdit',
            component: () => import('@/views/userEdit.vue'),
        },
        {
            path: '/forum',
            name: 'forum',
            component: () => import('../views/forum.vue'),
        },
        {
            path: '/forum/editor/:id?',
            name: 'editor',
            component: () => import('../views/editor.vue'),
            props: true
        },
        {
            path: '/oauth/complete',
            name: 'oAuthComplete',
            component: () => import('../views/auth/oAuthComplete.vue'),
        },
        {
            path: '/about',
            name: 'about',
            component: () => import('../views/about.vue'),
        },
        {
            path: '/event/:event_id',
            name: 'event',
            component: () => import('../views/event.vue'),
            props: true
        },
        {
            path: '/t',
            name: 'tournaments',
            component: () => import('../views/tournament/tournamentList.vue')
        },
        {
            path: '/t/:tid',
            component: () => import('../views/tournament/tournamentDetail.vue'),
            props: true,
            children: [
                {
                    path: '',
                    name: 'tournamentOverview',
                    component: () => import('../views/tournament/tournamentOverview.vue')
                },
                {
                    path: 'teams',
                    name: 'tournamentTeams',
                    component: () => import('../views/tournament/tournamentTeams.vue')
                },
                {
                    path: 'register',
                    name: 'tournamentRegister',
                    component: () => import('../views/tournament/tournamentRegister.vue')
                },
                {
                    path: 'qualifier',
                    name: 'tournamentQualifier',
                    component: () => import('../views/tournament/tournamentQualifier.vue')
                },
                {
                    path: 'bracket',
                    name: 'tournamentBracket',
                    component: () => import('../views/tournament/tournamentBracket.vue')
                },
                {
                    path: 'ranking',
                    name: 'tournamentRanking',
                    component: () => import('../views/tournament/tournamentRanking.vue')
                }
            ]
        },
        {
            path: '/t/:tid/match/:matchId',
            name: 'matchDetail',
            component: () => import('../views/tournament/matchDetail.vue'),
            props: true
        },
        {
            path: '/t/:tid/referee/:matchId',
            name: 'refereeWorkbench',
            component: () => import('../views/tournament/refereeWorkbench.vue'),
            props: true,
            meta: { requiresStaff: true }
        },
        {
            path: '/admin',
            name: 'admin',
            component: () => import('../views/admin/admin.vue'),
            meta: { requiresAdmin: true },
            children: [
                {
                    path: 'dashboard',
                    name: 'dashboard',
                    component: () => import('../views/admin/dashboard.vue')
                },
                {
                    path: 'users',
                    name: 'users',
                    component: () => import('../views/admin/users.vue')
                },
                {
                    path: 'announcement',
                    name: 'announcement',
                    component: () => import('../views/admin/announcement.vue')
                },
                {
                    path: 'posts',
                    name: 'posts',
                    component: () => import('../views/admin/posts.vue')
                },
                {
                    path: 'postFiles',
                    name: 'postFiles',
                    component: () => import('../views/admin/postFiles.vue')
                },
                {
                    path: 'events',
                    name: 'events',
                    component: () => import('../views/admin/events.vue')
                },
                {
                    path: 'events/:event_id/stage',
                    name: 'eventStages',
                    component: () => import('../views/admin/eventStages.vue'),
                    props: true
                },
                {
                    path: 'badges',
                    name: 'badges',
                    component: () => import('../views/admin/badges.vue')
                },
                {
                    path: 'tournament',
                    name: 'adminTournamentList',
                    component: () => import('../views/admin/tournament/adminTournamentList.vue')
                },
                {
                    path: 'tournament/:tid',
                    name: 'adminTournamentDetail',
                    component: () => import('../views/admin/tournament/adminTournamentDetail.vue'),
                    props: true
                }
            ]
        }
    ]
})

router.beforeEach(async (to, from, next) => {
    if (to.meta.requiresAdmin) {
        try {
            // 如果 store 中没有权限信息，先获取
            if (store.state.adminPermissions.length === 0 && store.state.isLogged) {
                const res = await getPermissions()
                store.commit('setPermissions', res)
            }
            if (hasAdminPermission(to.name)) {
                next()
            } else {
                next({ name: 'home' })
            }
        }
        catch (error) {
            next({ name: 'home' })
        }
    } else {
        next()
    }
})


import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({ showSpinner: false })

router.beforeEach((to, from, next) => {
    NProgress.start()
    next()
})

router.afterEach(() => {
    router.isReady().then(() => {
        NProgress.done()
    })
})


export default router;
