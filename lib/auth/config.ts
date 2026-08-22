export const SESSION_COOKIE_NAME = "workbuddy_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AuthConfiguration = {
  username: string;
  password: string | null;
  passwordHash: string | null;
  sessionSecret: string;
  configured: boolean;
  configurationError: string | null;
};

export function getAuthConfiguration(): AuthConfiguration {
  const username = process.env.WORKBUDDY_USERNAME?.trim() || "admin";
  const password = process.env.WORKBUDDY_PASSWORD || null;
  const passwordHash = process.env.WORKBUDDY_PASSWORD_HASH?.trim() || null;
  const sessionSecret = process.env.WORKBUDDY_SESSION_SECRET?.trim() || "";

  let configurationError: string | null = null;
  if (!password && !passwordHash) {
    configurationError =
      "WORKBUDDY_PASSWORD oder WORKBUDDY_PASSWORD_HASH fehlt.";
  } else if (sessionSecret.length < 32) {
    configurationError =
      "WORKBUDDY_SESSION_SECRET muss mindestens 32 Zeichen lang sein.";
  }

  return {
    username,
    password,
    passwordHash,
    sessionSecret,
    configured: configurationError === null,
    configurationError,
  };
}
