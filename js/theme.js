/* ========= THEME ========= */
import { loadThemePreference } from './utils.js';

const theme = loadThemePreference();

if (theme === "system") {
    document.documentElement.setAttribute(
        "data-theme",
        window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    );
} else {
    document.documentElement.setAttribute("data-theme", theme);
}
