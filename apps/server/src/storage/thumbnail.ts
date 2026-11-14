import sharp from 'sharp';

/** 썸네일: 긴 변 512px 이하(작은 원본은 키우지 않음), JPEG 품질 80. */
export const THUMB_MAX_SIDE = 512;
export const THUMB_QUALITY = 80;

export async function makeThumbnail(bytes: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(bytes)
    .resize({
      width: THUMB_MAX_SIDE,
      height: THUMB_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();
  return new Uint8Array(out);
}
