import { apiConfig, apiImageSource, fetchApiImageBlob, useSessionStore } from '../../../shared/api';

/** 서버 그림 경로(/assets/...)에는 ?download=1 을 붙여 파일로 받는다. 그림 데이터 주소·완성된 주소는 그대로. */
export function downloadPath(path: string): string {
  return path.startsWith('/assets/') ? `${path}?download=1` : path;
}

/** 받은 그림의 파일 이름: 제목에서 파일 이름에 못 쓰는 글자를 빼고, 그림 형식에 맞는 확장자를 붙인다. */
export function downloadFileName(title: string, mimeType: string): string {
  const cleaned = Array.from(title)
    .filter((char) => char.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(char))
    .join('')
    .trim();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  return `${cleaned === '' ? 'tome' : cleaned}.${extension}`;
}

/** 받은 그림을 파일로 저장한다(임시 주소를 만들어 링크를 눌러 저장하고 바로 해제). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 결과 그림을 받아 파일로 저장한다. 서버 모드에서는 로그인 토큰을 붙여 ?download=1 로 받고(저장소 주소로 302 를 따라감),
 * 가짜 응답 모드에서는 그림 데이터 주소에서 그대로 받는다. 못 받으면 던진다.
 */
export async function downloadImage(path: string, title: string): Promise<void> {
  const source = apiImageSource(downloadPath(path), apiConfig);
  let blob: Blob;
  if (source.direct) {
    const response = await fetch(source.src);
    if (!response.ok) throw new Error(`download failed: ${response.status}`);
    blob = await response.blob();
  } else {
    blob = await fetchApiImageBlob(source.url, useSessionStore.getState().token);
  }
  saveBlob(blob, downloadFileName(title, blob.type));
}
