import { createRouter, createWebHistory } from 'vue-router';
import IndexPage from '../pages/index.vue';
import UserPage from '../pages/b50.vue'; // Renamed for clarity
import AboutPage from '../pages/About.vue'; // Import the new About page
import UsersPage from '../pages/users.vue';

const routes = [
  { path: '/', component: IndexPage },
  { path: '/users', component: UsersPage },
  { path: '/b50', component: UserPage }, // Pass route params as props
  { path: '/about', component: AboutPage }, // Add the route for the About page
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
