import { drive_v3, google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import getAuthClient from './google-auth';

export default class TicketingGDrive {
    private _driveId: string | null;
    private _drive: drive_v3.Drive | null = null;

    constructor(driveId?: string) {
        this._driveId = driveId ?? null;
    }

    public async CreateConnection(): Promise<void> {

        const scopes = ['https://www.googleapis.com/auth/drive'];

        // get auth client (supports SECRET_GAPI_JSON env or secrets-gapi.json file)
        const auth = await getAuthClient(scopes);

        if (!auth) throw new Error('No Google auth credentials found (SECRET_GAPI_JSON / GAPI_CREDENTIALS_JSON, secrets-gapi.json, or GDRIVE_API_KEY)');

        this._drive = google.drive({ version: 'v3', auth });
    }


    public async UploadFileAsync(data: Buffer | NodeJS.ReadableStream | string, fileName?: string, mimeType = 'image/png'): Promise<string | null> {
        if (this._drive == null) throw new Error('Drive connection not initialized. Call CreateConnection() first.');

        let body: any;
        let name = fileName ?? 'upload';

        if (typeof data === 'string') {
            // treat as file path
            if (!fs.existsSync(data)) throw new Error('File not found: ' + data);
            name = fileName ?? path.basename(data);
            body = fs.createReadStream(data);
        } else if (Buffer.isBuffer(data)) {
            name = fileName ?? 'file.png';
            body = Readable.from(data);
        } else {
            // stream
            name = fileName ?? 'file.png';
            body = data as NodeJS.ReadableStream;
        }

        const media = { mimeType, body };

        const requestBody: any = { name };
        if (this._driveId) requestBody.parents = [this._driveId];

        const res = await this._drive.files.create({
            requestBody,
            media,
            fields: 'id, webViewLink, webContentLink',
            supportsAllDrives: true,
        });

        const fileId = res.data.id;
        if (!fileId) return null;

        try {
            await this._drive.permissions.create({
                fileId,
                requestBody: { role: 'reader', type: 'anyone' },
                supportsAllDrives: true,
            });
        } catch (e) {
            // ignore
        }

        const meta = await this._drive.files.get({ fileId, fields: 'webViewLink, webContentLink', supportsAllDrives: true });
        return meta.data.webViewLink ?? meta.data.webContentLink ?? `https://drive.google.com/file/d/${fileId}/view`;
    }
}