/**
 * 화면 조각을 내려받는 동안 보여 주는 자리. 눈에 보이는 것은 없고(깜빡임 방지),
 * 보조기기에는 role="status" 로 "불러오는 중"임을 알린다.
 */
export function PageLoading() {
  return <div role="status" aria-busy="true" />;
}
