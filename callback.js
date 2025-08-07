// This file is loaded by callback.html to handle the OIDC redirect.

// Use an IIFE (Immediately Invoked Function Expression) to avoid global scope pollution.
(async () => {
    // These settings MUST exactly match the configuration in your app.js file.
    const settings = {
        authority: "https://accounts.theboiismc.com/application/o/maps/",
        client_id: "MA8UF8AMFlBWFYeytrhX8iGNEM54m7bjJO5MuWKd",
        redirect_uri: "https://maps.theboiismc.com/callback.html",
        response_type: 'code',
        scope: 'openid profile',
    };

    const userManager = new oidc.UserManager(settings);

    try {
        // This function processes the token from the URL and completes the login.
        await userManager.signinRedirectCallback();
        console.log("Login successful! Redirecting to the main page.");
        // Redirect back to the main page after a successful login.
        window.location.href = "/";
    } catch (error) {
        // Log any errors that occur during the process.
        console.error("OIDC Signin callback error:", error);
    }
})();
