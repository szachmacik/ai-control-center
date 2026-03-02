// Ensure ai-control-center uses its own database, not polaris_track
const _rawDbUrl = process.env.DATABASE_URL ?? "";
const _databaseUrl = _rawDbUrl.includes('/polaris_track')
  ? _rawDbUrl.replace('/polaris_track', '/ai_control_center')
  : _rawDbUrl;

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: _databaseUrl,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
