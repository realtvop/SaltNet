import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router' // Import the router
import 'mdui/mdui.css'; // Import mdui base styles
import 'mdui'; // Import all mdui components

const app = createApp(App)

app.use(router) // Use the router

app.mount('#app')
