import fs from 'fs';
import { pipeline } from 'stream/promises';

export async function saveUploadToFile(stream: NodeJS.ReadableStream, destPath: string) {
  const dest = fs.createWriteStream(destPath);
  await pipeline(stream as any, dest as any);
}
