/* ========= AUTH ========= */
const authConfig = {
    authority: "https://accounts.theboiismc.com/application/o/maps/",
    client_id: "MA8UF8AMFlBWFYey",
    redirect_uri: window.location.origin + "/callback",
    response_type: "code",
    scope: "openid profile email"
};
