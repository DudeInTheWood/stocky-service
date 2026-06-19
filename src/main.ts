import { loadConfig } from "./config/app-config.js";
import { createApp } from "./app.js";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = createApp(config);

  await app.start();
}

bootstrap().catch((error) => {
  console.error("Stock watcher failed to start.", error);
  process.exit(1);
});
