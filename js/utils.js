/* ========= UTILITIES ========= */
export function showToast(message, type = "info") {
    // Simple toast placeholder
    console.log(`[${type.toUpperCase()}] ${message}`);
}

export function fetchJSON(url, options = {}) {
    return fetch(url, options).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    });
}

export function saveThemePreference(theme) {
    localStorage.setItem("theme", theme);
}

export function loadThemePreference() {
    return localStorage.getItem("theme") || "system";
}
