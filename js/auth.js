/**
 * @file auth.js
 * @description This file handles user authentication for TheBoiisMC Maps using OIDC (OpenID Connect)
 * with an Authentik instance. It manages the login, logout, and callback processes,
 * and updates the UI based on the user's authentication status.
 */

// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
    redirect_uri: "https://maps.theboiismc.com/callback.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com",
    response_type: 'code',
    automaticSilentRenew: true,
};
const userManager = new oidc.UserManager(authConfig);
const authService = {
    async login() { return userManager.signinRedirect(); },
    async logout() { return userManager.signoutRedirect(); },
    async getUser() { return userManager.getUser(); },
    async handleCallback() { return userManager.signinRedirectCallback(); }
};

document.addEventListener('DOMContentLoaded', async () => {
    // --- AUTHENTICATION CHECK & UI UPDATE ---
    const profileArea = document.getElementById('profile-area');
    const profileButton = document.getElementById('profile-button');
    const profileDropdown = document.getElementById('profile-dropdown');
    const loggedInView = document.getElementById('logged-in-view');
    const loggedOutView = document.getElementById('logged-out-view');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const savedPlacesBtn = document.getElementById('saved-places-btn');
    const usernameDisplay = loggedInView.querySelector('.username');
    const emailDisplay = loggedInView.querySelector('.email');
    let currentUser = null;

    const updateAuthUI = (user) => {
        currentUser = user && !user.expired ? user : null;
        const isLoggedIn = !!currentUser;
        loggedInView.hidden = !isLoggedIn;
        loggedOutView.hidden = isLoggedIn;
        if (isLoggedIn) {
            usernameDisplay.textContent = currentUser.profile.name || 'User';
            emailDisplay.textContent = currentUser.profile.email || '';
        }
    };

    try {
        if (window.location.pathname.endsWith("callback.html")) {
            await authService.handleCallback();
            window.location.href = "/";
        } else {
            const user = await authService.getUser();
            updateAuthUI(user);
        }
    } catch (error) {
        console.error("Authentication process failed:", error);
        
        // NEW: User-friendly error message for the console
        console.warn("Could not log in. This might be due to a network issue, an invalid login attempt, or a stale session. Please try logging in again.");
        
        // Display an alert or message to the user if needed
        // For now, we'll just ensure the UI is in a logged-out state
        updateAuthUI(null);
    }

    profileButton.addEventListener('click', (e) => {
        const isHidden = profileDropdown.style.display === 'none' || !profileDropdown.style.display;
        profileDropdown.style.display = isHidden ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
        if (profileDropdown.style.display === 'block' && !profileArea.contains(e.target)) {
            profileDropdown.style.display = 'none';
        }
    });

    loginBtn.addEventListener('click', (e) => { e.preventDefault(); authService.login(); });
    signupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = "https://accounts.theboiismc.com/if/flow/default-user-settings-flow/";
    });
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });
    // --- END AUTHENTICATION ---
});
