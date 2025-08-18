import { createApp } from "vue";
import { createPinia } from "pinia";

import "./style.css";
import App from "./App.vue";
import router from "./components/app/router.vue";
// Import Sober components
import "sober";
import { checkForUpdate } from "./components/app/checkForUpdate";

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);

app.mount("#app");

// Remove rescue element if it exists
const rescueElement = document.getElementById("rescue");
if (rescueElement) {
    document.body.removeChild(rescueElement);
}

checkForUpdate();
