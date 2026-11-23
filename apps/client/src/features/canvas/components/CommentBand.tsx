import { memo } from 'react';
import type { NodeComment } from '@tome/shared';
import { useAnswerComments } from '../hooks/useNodeComments';

/**
 * 코멘트가 달린 노드 오른쪽 아래에 붙는 핑크 코너와 띠. 시안: Corner 1480:135821(closed·open).
 * 가장 최근 코멘트의 글을 보여 준다. 코멘트가 없으면 아무것도 그리지 않는다.
 * 누르는 요소가 아니다(코멘트 열기는 노드 옆 도구 버튼). 마우스를 올리거나 포커스가 들어오거나 코멘트 창이 열려 있을 때 띠가 펼쳐진다.
 */
export const CommentBand = memo(function CommentBand({
  answerId,
  nodeId,
  list,
  open,
}: {
  answerId: string;
  nodeId: string;
  list: (answerId: string) => Promise<readonly NodeComment[]>;
  open: boolean;
}) {
  const query = useAnswerComments(answerId, { listComments: list });
  const latest = (query.data ?? [])
    .filter((comment) => comment.nodeId === nodeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  if (!latest) return null;
  return (
    <div className="canvas-comment-band" data-open={open || undefined}>
      <span className="canvas-comment-corner" aria-hidden="true" />
      <p className="canvas-comment-text">{latest.body}</p>
    </div>
  );
});
