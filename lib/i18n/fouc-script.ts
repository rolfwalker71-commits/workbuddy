import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_STORAGE_KEY } from "./locales";

/** Inline FOUC guard for RootLayout — must stay free of "use client". */
export const LOCALE_FOUC_SCRIPT = `(function(){try{var k=${JSON.stringify(LOCALE_STORAGE_KEY)};var c=${JSON.stringify(LOCALE_COOKIE)};var l=localStorage.getItem(k);if(l!=="en"&&l!=="de")l=${JSON.stringify(DEFAULT_LOCALE)};document.documentElement.lang=l;document.cookie=c+"="+l+";path=/;max-age=31536000;samesite=lax"}catch(e){}})();`;
