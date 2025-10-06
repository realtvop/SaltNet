import { createI18n } from "vue-i18n";
import zhCN from "./locales/zh-CN";
import enUS from "./locales/en-US";
import jaJP from "./locales/ja-JP";

const LOCALE_STORAGE_KEY = "saltnet-locale";

function getDefaultLocale(): string {
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (savedLocale && ["zh-CN", "en-US", "ja-JP"].includes(savedLocale)) {
        return savedLocale;
    }

    const browserLang = navigator.language;
    if (browserLang.startsWith("zh")) {
        return "zh-CN";
    } else if (browserLang.startsWith("ja")) {
        return "ja-JP";
    } else {
        return "en-US";
    }
}

export const i18n = createI18n({
    legacy: false,
    locale: getDefaultLocale(),
    fallbackLocale: "zh-CN",
    messages: {
        "zh-CN": zhCN,
        "en-US": enUS,
        "ja-JP": jaJP,
    },
});

export function setLocale(locale: string) {
    i18n.global.locale.value = locale as "zh-CN" | "en-US" | "ja-JP";
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function getLocale(): string {
    return i18n.global.locale.value;
}

export const availableLocales = [
    { code: "zh-CN", name: "简体中文" },
    { code: "en-US", name: "English" },
    { code: "ja-JP", name: "日本語" },
];
