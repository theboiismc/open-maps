import { UserManager } from 'oidc-client-ts';
import { showToast } from './ui.js';

const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
    redirect_uri: "https://maps.theboiismc.com/callback.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com",
    response_type: 'code',
    automaticSilentRenew: true,
};

const userManager = new UserManager(authConfig);

// --- Public API ---

/**
 * Initializes the authentication service, handles callbacks, and returns the initial user.
 * @returns {Promise<User|null>} The current user object or null.
 */
export async function initializeAuth() {
    // Handle the OIDC callback if we're on the callback page
    if (window.location.pathname.endsWith("callback.html")) {
        try {
            await userManager.signinRedirectCallback();
            window.location.href = "/";
        } catch (error) {
            console.error("OIDC callback failed:", error);
            window.location.href = "/"; // Redirect home even on failure
        }
        return null; // Stop further execution on the callback page
    }

    // Initial check for a faster UI update
    try {
        const user = await userManager.getUser();
        return user && !user.expired ? user : null;
    } catch (error) {
        console.error("Initial getUser check failed:", error);
        return null;
    }
}

/**
 * Sets up listeners for user session changes.
 * @param {Function} callback - The function to call with the user object when the session changes.
 */
export function onUserUpdate(callback) {
    userManager.events.addUserLoaded(user => {
        console.log("OIDC Event: User loaded", user);
        const userFirstName = user.profile.name.split(' ')[0];
        showToast(`Welcome back, ${userFirstName}!`, 'success');
        callback(user);
    });

    userManager.events.addUserUnloaded(() => {
        console.log("OIDC Event: User unloaded");
        callback(null);
    });
}

/**
 * Redirects the user to the login page.
 */
export function login() {
    userManager.signinRedirect();
}

/**
 * Redirects the user to the logout page.
 */
export function logout() {
    userManager.signoutRedirect();
}
