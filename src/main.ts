import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router' // Import the router
import 'mdui/mdui.css'; // Import mdui base styles
import { setColorScheme } from 'mdui'; // Import all mdui components

const app = createApp(App)

app.use(router) // Use the router

app.mount('#app')

setColorScheme("#8E92E1");