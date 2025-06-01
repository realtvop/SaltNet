import { createRouter, createWebHashHistory } from "vue-router";
import IndexPage from "../pages/index.vue";
import UserPage from "../pages/b50.vue";
import AboutPage from "../pages/About.vue";
import UsersPage from "../pages/users.vue";
import SettingsPage from "../pages/settings.vue";
import SongsPage from "../pages/songs.vue";

const routes = [
    { path: "/", component: IndexPage },
    { path: "/users", component: UsersPage },
    { path: "/songs", component: SongsPage },
    { path: "/b50", component: UserPage },
    { path: "/b50/:id", component: UserPage, props: true },
    { path: "/settings", component: SettingsPage },
    { path: "/about", component: AboutPage },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

export default router;
