import { google } from "googleapis";
import fs from "fs";
import path from "path";
import createLogger from '../logger';

const logger = createLogger('GoogleAuth');

export async function getAuthClient(scopes: string[]) {
  const keyFilePath =
    process.env.GAPI_CREDENTIALS_PATH ??
    path.join(process.cwd(), "secrets-gapi.json");

  // 1) service account JSON from env (raw or base64)
  const envJson =
    process.env.SECRET_GAPI_JSON ??
    process.env.GAPI_CREDENTIALS_JSON ??
    process.env.SECRET_GAPI_JSON_B64;
  if (envJson) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(envJson);
    } catch (e) {
      try {
        const decoded = Buffer.from(envJson, "base64").toString("utf8");
        parsed = JSON.parse(decoded);
      } catch (err) {
        logger.error('Failed to parse service account JSON from environment variable');
        throw new Error(
          "Failed to parse service account JSON from environment variable",
        );
      }
    }

    const gauth = new google.auth.GoogleAuth({ credentials: parsed, scopes });
    return gauth;
  }

  // 2) key file on disk
  if (fs.existsSync(keyFilePath)) {
    logger.info('Using key file for Google auth', { keyFilePath });
    const gauth = new google.auth.GoogleAuth({ keyFile: keyFilePath, scopes });
    return gauth;
  }
  logger.error('No Google credentials found');
  throw new Error(
    "No Google credentials found: set SECRET_GAPI_JSON or provide a secrets-gapi.json file",
  );
}

export default getAuthClient;
