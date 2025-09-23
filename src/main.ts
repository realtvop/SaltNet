import { createApp } from "vue";
import { createPinia } from "pinia";

import "./style.css";
import App from "./App.vue";
import router from "./components/app/router.vue";
import "mdui/mdui.css";
import { setColorScheme } from "mdui";
import { checkForUpdate } from "./components/app/checkForUpdate";

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);

app.mount("#app");

setColorScheme("#8E92E1"); // #5EEAC7

document.body.removeChild(document.getElementById("rescue") as HTMLElement);

document.title = `${import.meta.env.DEV ? "[DEV] " : ""}SaltNet${window.location.hostname === "alpha.realtvop.top" ? " α" : ""}`;

checkForUpdate();

if (window.location.search.startsWith("?genb50")) {
    router.push(`/b50/render${window.location.search}`);
}
