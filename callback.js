document.addEventListener('DOMContentLoaded', () => {

    const authConfig = {
        authority: "https://accounts.theboiismc.com/application/o/maps/",
        
        // FIXED: This MUST match maps_v6.3.2.js exactly
        client_id: "xqfUqdpbn8PCCz6ouRAQtFV0oUyg4lpEb64U8W9s",
        
        redirect_uri: "https://maps.theboiismc.com/callback.html",
        post_logout_redirect_uri: "https://maps.theboiismc.com",
        response_type: 'code',
        scope: 'openid profile email offline_access',
        userStore: new oidc.WebStorageStateStore({ store: window.sessionStorage })
    };
    
    const userManager = new oidc.UserManager(authConfig);

    userManager.signinRedirectCallback()
        .then((user) => {
            console.log("Login successful", user);
            window.location.href = "https://maps.theboiismc.com";
        })
        .catch(error => {
            console.error("Error during signinRedirectCallback:", error);
            // Even on error, redirect home to clear the url parameters
            window.location.href = "https://maps.theboiismc.com";
        });
});
