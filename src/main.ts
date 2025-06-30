import { createApp } from "vue";
import { createPinia } from "pinia";

import "./style.css";
import App from "./App.vue";
import router from "./components/router.vue";
import "mdui/mdui.css";
import { setColorScheme, snackbar } from "mdui";
import { checkForUpdate } from "./utils/checkForUpdate";

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);

app.mount("#app");

setColorScheme("#8E92E1"); // #5EEAC7

checkForUpdate();