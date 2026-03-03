export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
// Falls back to /login (OTP) when Manus OAuth env vars are not configured.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  // If Manus OAuth is not configured (e.g. Coolify deployment), use OTP login
  if (!oauthPortalUrl || !appId) {
    return "/login";
  }

  try {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  } catch {
    return "/login";
  }
};
