import app from "./app";
import { logger } from "./lib/logger";
import { refreshSources } from "./lib/sources";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void refreshSources().catch(err => logger.error({ err }, "Opportunity refresh failed"));
  setInterval(() => {
    void refreshSources(true).catch(err => logger.error({ err }, "Opportunity refresh failed"));
  }, 6 * 60 * 60 * 1000).unref();
});
