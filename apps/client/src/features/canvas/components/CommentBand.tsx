import { memo } from 'react';
import type { NodeComment } from '@tome/shared';
import { useAnswerComments } from '../hooks/useNodeComments';

/**
 * 코멘트가 달린 노드 오른쪽 아래에 붙는 핑크 코너와 띠. 시안: Corner 1480:135821(closed·open).
 * 가장 최근 코멘트의 글을 두 줄까지 보여 준다. 코멘트가 없으면 아무것도 그리지 않는다.
 * 누르는 요소가 아니다(코멘트 열기는 노드 옆 도구 버튼). 마우스를 올리면 띠가 펼쳐지고,
 * 노드 도구가 보이거나 코멘트 창이 열려 있으면 띠 글은 접고 코너만 남긴다(history.css).
 */
export const CommentBand = memo(function CommentBand({
  answerId,
  nodeId,
  list,
}: {
  answerId: string;
  nodeId: string;
  list: (answerId: string) => Promise<readonly NodeComment[]>;
}) {
  const query = useAnswerComments(answerId, { listComments: list });
  const latest = (query.data ?? [])
    .filter((comment) => comment.nodeId === nodeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  if (!latest) return null;
  return (
    <div className="canvas-comment-band">
      <span className="canvas-comment-corner" aria-hidden="true" />
      <p className="canvas-comment-text">
        <span>{latest.body}</span>
      </p>
    </div>
  );
});
