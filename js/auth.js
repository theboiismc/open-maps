// Authentication: OIDC via Authentik, user profile UI, login/logout, and events

let userManager;
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "xqfUqdpbn8PCCz6ouRAQtFV0oUyg4lpEb64U8W9s",
    redirect_uri: "https://maps.theboiismc.com/callback.html",
    post_logout_redirect_uri: "https://maps.theboiismc.com",
    response_type: 'code',
    automaticSilentRenew: true,
};

export function setUserManager(oidc) {
    userManager = new oidc.UserManager(authConfig);
}

export function getUserManager() {
    return userManager;
}

export const authService = {
    async login() { return userManager.signinRedirect(); },
    async logout() { return userManager.signoutRedirect(); },
    async getUser() { return userManager.getUser(); },
    async handleCallback() { return userManager.signinRedirectCallback(); }
};

export function onUserLoaded(cb) {
    userManager.events.addUserLoaded(cb);
}
export function onUserUnloaded(cb) {
    userManager.events.addUserUnloaded(cb);
}