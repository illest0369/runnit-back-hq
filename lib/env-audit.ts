let logged = false;

export function logAuthEnvStatus() {
  if (logged) return;
  logged = true;

  console.info("RBHQ_AUTH_ENV", JSON.stringify({
    appPinPresent: Boolean(process.env.APP_PIN),
    sessionSecretPresent: Boolean(process.env.SESSION_SECRET),
    operatorUsernamePresent: Boolean(process.env.OPERATOR_USERNAME ?? process.env.OWNER_USERNAME),
    nodeEnv: process.env.NODE_ENV ?? "unset",
  }));
}
