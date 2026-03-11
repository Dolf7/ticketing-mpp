import sharp from 'sharp';
import path from 'path';
import createLogger from '../logger';

const logger = createLogger('TicketImage');

function escapeXml(unsafe: string) {
  return unsafe.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

export async function composeTicketImage(options: { templatePath?: string; qrBuffer: Buffer; buyerName: string; ticketCode: string; }): Promise<Buffer> {
  const templatePath = options.templatePath ?? path.join(process.cwd(), 'public', 'ticket-template', 'Kupon-Ticket-Template.jpg');
  const qrBuffer = options.qrBuffer;
  const buyerName = options.buyerName ?? '';
  const ticketCode = options.ticketCode ?? '';

  // Load template and read metadata
  logger.debug('composeTicketImage called', { templatePath, buyerName: options.buyerName, ticketCode: options.ticketCode });
  const template = sharp(templatePath);
  const meta = await template.metadata();
  const width = meta.width ?? 1000;
  const height = meta.height ?? 1000;

  // Use explicit pixel coordinates per request (template assumed 1080x1080)
  const targetSize = 1080;
  const effectiveWidth = width || targetSize;
  const effectiveHeight = height || targetSize;

  // QR code box coordinates provided by user:
  // Vertical: start 350px to 840px
  // Horizontal: start 275px to 800px
  const bgLeft = 275;
  const bgTop = 350;
  const bgRight = 800;
  const bgBottom = 840;
  const bgWidth = bgRight - bgLeft; // 525
  const bgHeight = bgBottom - bgTop; // 490

  // Make QR fill the white background panel exactly (no internal padding)
  const qrSize = Math.min(bgWidth, bgHeight);
  const qrLeft = Math.round(bgLeft + (bgWidth - qrSize) / 2);
  const qrTop = Math.round(bgTop + (bgHeight - qrSize) / 2);

  // Resize QR to the desired size so it fills the panel (no padding)
  const qrResized = await sharp(qrBuffer).resize(qrSize, qrSize).png().toBuffer();

  // Text positions provided by user (vertical ranges). We'll center horizontally.
  // Name: V 900-944 -> use baseline around 922, font ~44px
  const nameY = 922;
  const nameFont = 44;

  // Ticket code: V 996-1024 -> baseline ~1010
  const codeY = 1010;
  const codeFont = 28;
  const lineWidth = Math.round(effectiveWidth * 0.56);
  const lineHeight = Math.max(3, Math.round(effectiveHeight * 0.004));
  const lineX = Math.round((effectiveWidth - lineWidth) / 2);

  // Line (underline) Y position: positioned a bit below the name
  const lineY = nameY + Math.round(effectiveHeight * 0.04);


  const safeName = escapeXml((buyerName || '').toUpperCase());
  const safeCode = escapeXml(ticketCode);

  // SVG for white rounded background behind QR
  const bgRadius = Math.round(Math.min(bgWidth, bgHeight) * 0.06);
  const bgSvg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="${effectiveWidth}" height="${effectiveHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${bgLeft}" y="${bgTop}" rx="${bgRadius}" ry="${bgRadius}" width="${bgWidth}" height="${bgHeight}" fill="#FFFFFF" />
  </svg>`;

  // Create SVG for text and underline — centered alignment, white text
  const textSvg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="${effectiveWidth}" height="${effectiveHeight}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .name { fill: #FFFFFF; font-family: 'Georgia', serif; font-weight: 700; font-size: ${nameFont}px; letter-spacing: 1px; }
      .code { fill: #FFFFFF; font-family: 'Georgia', serif; font-size: ${codeFont}px; }
    </style>
    <text x="50%" y="${nameY}" text-anchor="middle" class="name">${safeName}</text>
    <rect x="${lineX}" y="${lineY}" width="${lineWidth}" height="${lineHeight}" fill="#FFFFFF" rx="${Math.ceil(lineHeight/2)}" />
    <text x="50%" y="${codeY}" text-anchor="middle" class="code">${safeCode}</text>
  </svg>`;

  // Composite the layers: template -> white bg -> QR -> text
  logger.debug('Compositing image', { qrLeft, qrTop, qrSize, bgLeft, bgTop, bgWidth, bgHeight });
  const composed = await template
    .composite([
      { input: Buffer.from(bgSvg), top: 0, left: 0 },
      { input: qrResized, top: qrTop, left: qrLeft },
      { input: Buffer.from(textSvg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  logger.info('composeTicketImage completed', { buyerName, ticketCode, outSize: composed.length });
  return composed;
}

export default composeTicketImage;
