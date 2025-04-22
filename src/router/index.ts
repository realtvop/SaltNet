import { createRouter, createWebHistory } from 'vue-router';
import IndexPage from '../pages/index.vue';
import UserPage from '../pages/[username].vue'; // Renamed for clarity
import SettingsPage from '../pages/SaltNet/settings.vue';
import FavoritesPage from '../pages/SaltNet/favorites.vue'; // Assuming this exists

const routes = [
  { path: '/', component: IndexPage },
  // Use a dynamic segment for the username
  { path: '/user/:username', component: UserPage, props: true }, // Pass route params as props
  { path: '/settings', component: SettingsPage },
  { path: '/favorites', component: FavoritesPage }, // Add route for favorites
  // Add other routes as needed
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
