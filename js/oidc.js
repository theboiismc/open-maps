// --- AUTHENTICATION SERVICE (OIDC with Authentik) ---
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/theboiismc/",
    // *** IMPORTANT: Replace this with your actual Client ID from Authentik. ***
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

const profileArea = document.getElementById('profile-area');
const profileButton = document.getElementById('profile-button');
const profileDropdown = document.getElementById('profile-dropdown');
const loggedInView = document.getElementById('profile-area');
const loggedOutView = document.getElementById('auth-buttons');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const savedPlacesBtn = document.getElementById('saved-places-btn');
const usernameDisplay = profileDropdown.querySelector('.username');
const emailDisplay = profileDropdown.querySelector('.email');

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

profileButton.addEventListener('click', (e) => {
    e.stopPropagation();
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
    // Action: Replace with the correct URL for your registration flow
    window.location.href = "https://accounts.theboiismc.com/if/flow/registration-flow/";
});
logoutBtn.addEventListener('click', (e) => { e.preventDefault(); authService.logout(); });

export { authService, updateAuthUI, currentUser };
