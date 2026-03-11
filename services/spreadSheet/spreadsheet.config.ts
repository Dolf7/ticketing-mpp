import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import createLogger from '../logger';

const logger = createLogger('SpreadsheetConfig');

export class SpreadsheetConfig {
	/**
	 * Ensure a `secrets-gapi.json` exists at the project root.
	 * - If present and accessible: do nothing.
	 * - If missing: create it from process.env.SECRET_GAPI_JSON.
	 */
	static async ensureSecretsGapiJson(): Promise<void> {
		const filePath = path.resolve(process.cwd(), "secrets-gapi.json");

		try {
			await fsp.access(filePath, fs.constants.R_OK | fs.constants.W_OK);
			return;
		} catch (_) {
			const envVal = process.env.SECRET_GAPI_JSON;
			if (!envVal) {
				logger.error('SECRET_GAPI_JSON not set and secrets-gapi.json missing');
				throw new Error(
					"Environment variable SECRET_GAPI_JSON is not set; cannot create secrets-gapi.json"
				);
			}

			let content = envVal;

			// If the env value is valid JSON, parse and pretty-print it.
			// Also convert escaped `\\n` sequences in the private_key to real newlines.
			try {
				const parsed = JSON.parse(envVal);
				if (parsed && typeof parsed === "object") {
					if (typeof parsed.private_key === "string") {
						parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
					}
					content = JSON.stringify(parsed, null, 2);
				}
			} catch (e) {
				// If it's not JSON, use the raw env value as-is.
				content = envVal;
			}

			await fsp.writeFile(filePath, content, { encoding: "utf8", mode: 0o600 });
			logger.info('wrote secrets-gapi.json to disk', { filePath });
		}
	}
}

export default SpreadsheetConfig;

