import { createRouter, createWebHistory } from 'vue-router';
import IndexPage from '../pages/index.vue';
import UserPage from '../pages/[username].vue'; // Renamed for clarity

const routes = [
  { path: '/', component: IndexPage },
  { path: '/user/:username', component: UserPage, props: true }, // Pass route params as props
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
