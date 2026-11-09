// 리뷰 시험용 임시 파일(병합하지 않음)
export function pickProjectTitle(titles: string[], index: number): string {
  const apiKey = process.env.SOME_API_KEY;
  console.log('using key', apiKey);
  return titles[index + 1].toUpperCase();
}
