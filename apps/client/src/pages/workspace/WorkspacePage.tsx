import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice, Icon } from '../../shared/ui';
import { IconMenu } from './IconMenu';
import { pageIdFromSearch, pageMenu } from './pageMenu';
import { PromptBar, type PromptSubmit } from './PromptBar';
import { promptBarInfo } from './prompt';
import { WorkspaceHeader } from './WorkspaceHeader';

export function WorkspacePage() {
  const { id = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const requestedPage = pageIdFromSearch(search);
  const workspace = useQuery({
    queryKey: ['workspace', id, requestedPage ?? null],
    queryFn: () => api.getWorkspace(id, requestedPage),
  });
  const queryClient = useQueryClient();
  // 페이지 추가·세트 만들기가 실패했을 때의 오류(다음 시도에서 지운다)
  const [actionError, setActionError] = useState<unknown>(null);
  const addingPage = useRef(false);
  // 화면에 잠금을 보여 주는 값(ref 는 연타를 막고, 이 값은 + 버튼을 잠근다)
  const [adding, setAdding] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace', id] });
  // 입력 중인 글은 페이지마다 화면에만 보존한다(새로고침 전까지).
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const redirectTo = authRedirectTarget(workspace.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const pageId = workspace.data?.currentPageId ?? '';
  const bar = workspace.data ? promptBarInfo(workspace.data) : null;
  const menu = workspace.data ? pageMenu(workspace.data) : null;

  // 새 페이지를 만들고 그 페이지로 옮긴다. 연달아 눌러도 한 번만 만든다.
  const addPage = async () => {
    if (addingPage.current) return;
    addingPage.current = true;
    setAdding(true);
    setActionError(null);
    try {
      const { page } = await api.createPage(id);
      await refresh();
      setSearch({ page: page.id });
    } catch (error) {
      setActionError(error);
    } finally {
      addingPage.current = false;
      setAdding(false);
    }
  };

  // 프롬프트로 세트를 만든다. 성공하면 이 페이지의 입력 글을 비우고 화면을 다시 받는다.
  // 단계 진행(advanceJob)은 캔버스(#26)가 응답의 job 으로 이어 간다.
  const sendPrompt = async (request: PromptSubmit) => {
    setActionError(null);
    try {
      await api.createSet(id, { pageId, ...request });
      setDrafts((all) => ({ ...all, [pageId]: '' }));
      await refresh();
    } catch (error) {
      setActionError(error);
    }
  };

  return (
    // 바깥 레이아웃의 여백을 지우고 화면 전체를 쓴다.
    <section
      aria-busy={workspace.isPending || undefined}
      className="relative -m-[var(--space-padding-8)] min-h-screen bg-[color:var(--color-background-weak)]"
    >
      <WorkspaceHeader title={workspace.data?.project.title} />
      {workspace.isError ? (
        <div className="px-[var(--space-padding-8)]">
          <ErrorNotice
            message={COPY[errorCopyKey(workspace.error)]}
            onRetry={() => void workspace.refetch()}
          />
        </div>
      ) : null}
      {actionError !== null ? (
        <div className="px-[var(--space-padding-8)]">
          <ErrorNotice message={COPY[errorCopyKey(actionError)]} />
        </div>
      ) : null}
      {menu ? (
        <div className="fixed top-[var(--space-padding-8)] right-[var(--space-padding-8)]">
          <IconMenu
            menu={menu}
            onSelectPage={(next) => setSearch({ page: next })}
            onAddPage={() => void addPage()}
            addingPage={adding}
          />
        </div>
      ) : null}
      {bar ? (
        <div className="fixed inset-x-0 bottom-[var(--space-padding-8)] flex justify-center px-[var(--grid-margin)]">
          <div className="flex w-[var(--size-prompt-width)] max-w-full items-end gap-[var(--space-gap-4)]">
            {/* 첨부(클립) 버튼은 자리만 둔다. 동작은 첨부 기능(T11)에서. */}
            <span
              aria-hidden="true"
              className="flex size-[var(--size-icon-menu-button)] shrink-0 items-center justify-center rounded-[var(--radius-max)] bg-[color:var(--color-background-default)] text-[color:var(--color-font-disable)] shadow-[var(--shadow-icon-menu)]"
            >
              <Icon name="clip" />
            </span>
            <div className="min-w-0 flex-1">
              <PromptBar
                state={bar.state}
                emptyPage={bar.emptyPage}
                value={drafts[pageId] ?? ''}
                onChange={(value) => setDrafts((all) => ({ ...all, [pageId]: value }))}
                onSubmit={sendPrompt}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
