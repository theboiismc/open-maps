document.addEventListener('DOMContentLoaded', () => {

    const authConfig = {
        authority: "https://accounts.theboiismc.com/application/o/maps/",
        client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
        redirect_uri: "https://maps.theboiismc.com/callback.html",
        post_logout_redirect_uri: "https://maps.theboiismc.com",
        response_type: 'code',
        scope: 'openid profile',
    };
    
    const userManager = new oidc.UserManager(authConfig);

    userManager.signinRedirectCallback()
        .then(() => {
            window.location.href = "https://maps.theboiismc.com";
        })
        .catch(error => {
            console.error("Error during signinRedirectCallback:", error);
            window.location.href = "https://maps.theboiismc.com";
        });
});
