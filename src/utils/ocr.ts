import { createWorker } from 'tesseract.js';

type OCRWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

function getBoxFromWord(w: any) {
  if (!w) return { left: 0, top: 0, width: 0, height: 0 };

  if (w.bbox && typeof w.bbox === 'object') {
    const x0 = w.bbox.x0 ?? w.bbox.x ?? w.bbox.x1 ?? 0;
    const y0 = w.bbox.y0 ?? w.bbox.y ?? w.bbox.y1 ?? 0;
    const x1 = w.bbox.x1 ?? (w.bbox.x0 ? (w.bbox.x0 + (w.bbox.w ?? 0)) : x0);
    const y1 = w.bbox.y1 ?? (w.bbox.y0 ? (w.bbox.y0 + (w.bbox.h ?? 0)) : y0);
    return { left: x0, top: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  }

  if ('x0' in w && 'y0' in w && 'x1' in w && 'y1' in w) {
    return {
      left: w.x0,
      top: w.y0,
      width: w.x1 - w.x0,
      height: w.y1 - w.y0
    };
  }

  if ('left' in w && 'top' in w && 'width' in w && 'height' in w) {
    return { left: w.left, top: w.top, width: w.width, height: w.height };
  }

  return {
    left: w.x ?? 0,
    top: w.y ?? 0,
    width: w.w ?? 0,
    height: w.h ?? 0
  };
}

export async function ocrImage(imagePath: string): Promise<{ text: string; words: OCRWord[] }> {
  const worker = await createWorker();

  await worker.loadLanguage('eng');
  await worker.initialize('eng');

  const { data } = await worker.recognize(imagePath);

  const words: OCRWord[] = (data.words || [])
    .map((w: any) => {
      const box = getBoxFromWord(w);
      return {
        text: (w.text || w.word || '').toString(),
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height)
      };
    })
    .filter((w: OCRWord) => w.text && w.text.trim().length > 0);

  await worker.terminate();

  return {
    text: data.text || words.map(w => w.text).join(' '),
    words
  };
}
