import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import 'mdui/mdui.css';
import { setColorScheme } from 'mdui';
import { checkForUpdate } from './utils/checkForUpdate';

const app = createApp(App)

app.use(router)

app.mount('#app')

setColorScheme("#8E92E1"); // #5EEAC7

checkForUpdate();