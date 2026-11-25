// Offline checks must never inherit production credentials or load .env.
Object.assign(process.env, {
  DATABASE_URL: process.env.BRAIN_GYM_INTEGRATION === "1"
    ? process.env.TEST_DATABASE_URL
    : "postgresql://test:test@127.0.0.1:1/brain_gym_test",
  OPENAI_API_KEY: "sk-offline-test-do-not-use",
  OPENAI_MODEL: "test-model",
  LOCAL_USER_ID: "00000000-0000-0000-0000-000000000001",
  APP_PASSWORD: "test-password",
  SESSION_SECRET: "test-secret-at-least-32-characters-long"
});
