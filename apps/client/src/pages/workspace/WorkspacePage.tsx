import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Id } from '@tome/shared';
import { useCallback, useId, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { WorkspaceCanvas } from '../../features/canvas';
import { api, authRedirectTarget, errorCopyKey } from '../../shared/api';
import { COPY } from '../../shared/copy';
import { ErrorNotice } from '../../shared/ui';
import {
  downloadImage,
  finishAvailability,
  FinishModal,
  resultImagePath,
  ResultView,
} from './finish';
import { IconMenu } from './IconMenu';
import { pageIdFromSearch, pageMenu } from './pageMenu';
import { ClipIcon } from './PromptIcons';
import { PromptBar, type PromptSubmit } from './PromptBar';
import { promptBarInfo } from './prompt';
import { useRemixConnections } from './remix/useRemixConnections';
import { RemixPanel } from './remix/RemixPanel';
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
  const remix = useRemixConnections(workspace.data);
  // 페이지 추가·세트 만들기가 실패했을 때의 오류(다음 시도에서 지운다)
  const [actionError, setActionError] = useState<unknown>(null);
  const addingPage = useRef(false);
  // 화면에 잠금을 보여 주는 값(ref 는 연타를 막고, 이 값은 + 버튼을 잠근다)
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const [finishOpen, setFinishOpen] = useState(false);
  // 완료가 끝나면 대표 버전을 결과 크게 보기로 보여 주고, 닫으면 홈으로 간다(#124).
  const [resultCover, setResultCover] = useState<Id | null>(null);
  const downloadingNow = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const finishButton = useRef<HTMLElement | null>(null);
  const candidates = useQuery({
    queryKey: ['finish-candidates', id],
    queryFn: () => api.getFinishCandidates(id),
    enabled: finishOpen,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace', id] });
  // 입력 중인 글은 페이지마다 화면에만 보존한다(새로고침 전까지).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // 리믹스 패널(#41): 열림 · 상대 저장 중(연타 막기) · 저장 실패
  const remixPanelId = useId();
  const [remixOpen, setRemixOpen] = useState(false);
  const choosingPartner = useRef(false);
  const [choosing, setChoosing] = useState(false);
  const [chooseError, setChooseError] = useState<unknown>(null);
  const openRemix = useCallback(() => {
    setChooseError(null);
    setRemixOpen(true);
  }, []);
  const closeRemix = useCallback(() => setRemixOpen(false), []);

  const redirectTo = authRedirectTarget(workspace.error);
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  const pageId = workspace.data?.currentPageId ?? '';
  const bar = workspace.data ? promptBarInfo(workspace.data) : null;
  const menu = workspace.data ? pageMenu(workspace.data) : null;

  // 완료가 끝나면(게시까지 끝났거나, 게시만 실패한 뒤 Done) 완료 모달을 닫고 대표 버전을 크게 보여 준다.
  const finished = (_result: 'finished' | 'posted', coverAnswerId: Id) => {
    setFinishOpen(false);
    setDownloadError(null);
    setResultCover(coverAnswerId);
    void refresh();
  };

  // 결과 크게 보기를 닫으면(닫기·Esc) 서가를 다시 받고 홈으로 간다. 홈은 done 플래시를 띄운다.
  const closeResult = () => {
    setResultCover(null);
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void navigate('/', { state: { flash: 'done' } });
  };

  const resultPath =
    resultCover === null
      ? null
      : resultImagePath(
          resultCover,
          candidates.data?.answers.find((answer) => answer.id === resultCover)?.thumbUrl,
        );

  // Download: 대표 버전 그림을 파일로 받는다. 받는 동안 버튼을 잠그고, 연달아 눌러도 한 번만 받는다.
  const download = async () => {
    if (downloadingNow.current || resultPath === null) return;
    downloadingNow.current = true;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadImage(resultPath, workspace.data?.project.title ?? '');
    } catch (error) {
      setDownloadError(error);
    } finally {
      downloadingNow.current = false;
      setDownloading(false);
    }
  };

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

  // 리믹스 상대를 고른다. 저장되면 제목에 상대가 붙도록 화면을 다시 받고 패널을 닫는다.
  // 실패하면 패널 안에 오류를 보여 주고, 원래 상대(또는 상대 없음)를 그대로 둔다.
  const choosePartner = async (partnerId: string) => {
    if (choosingPartner.current) return;
    choosingPartner.current = true;
    setChoosing(true);
    setChooseError(null);
    try {
      await api.setRemixPartner(id, partnerId);
      await refresh();
      setRemixOpen(false);
    } catch (error) {
      setChooseError(error);
    } finally {
      choosingPartner.current = false;
      setChoosing(false);
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
      {/* 캔버스(absolute, 화면 전체) 위에 헤더를 올린다. 헤더 빈 곳은 캔버스 끌기를 막지 않게 로고만 누를 수 있다 */}
      <div className="pointer-events-none relative z-10">
        <WorkspaceHeader
          title={workspace.data?.project.title}
          partnerName={workspace.data?.project.remixPartner?.displayName}
        />
      </div>
      {workspace.isError ? (
        <div className="relative z-10 px-[var(--space-padding-8)]">
          <ErrorNotice
            message={COPY[errorCopyKey(workspace.error)]}
            onRetry={() => void workspace.refetch()}
          />
        </div>
      ) : null}
      {remix?.error ? (
        <div className="relative z-10 px-[var(--space-padding-8)]">
          <ErrorNotice message={COPY[errorCopyKey(remix.error)]} onRetry={remix.retry} />
        </div>
      ) : null}
      {actionError !== null ? (
        <div className="relative z-10 px-[var(--space-padding-8)]">
          <ErrorNotice message={COPY[errorCopyKey(actionError)]} />
        </div>
      ) : null}
      {/* 가운데 생성 캔버스(#26, 프런트 B). 세트·단계 진행·답변 카드는 캔버스가 그리고, 이 화면은 자리와 데이터만 넘긴다.
          페이지를 바꾸면(?page=) 캔버스는 그 페이지 세트로 새로 그린다. */}
      {workspace.data ? (
        <WorkspaceCanvas projectId={id} pageId={pageId} workspace={workspace.data} remix={remix} />
      ) : null}
      {menu ? (
        <div className="fixed top-[var(--space-padding-8)] right-[var(--space-padding-8)]">
          <IconMenu
            menu={menu}
            onSelectPage={(next) => setSearch({ page: next })}
            onAddPage={() => void addPage()}
            addingPage={adding}
            finish={
              workspace.data
                ? {
                    ...finishAvailability(workspace.data),
                    onOpen: () => {
                      finishButton.current = document.activeElement as HTMLElement | null;
                      setFinishOpen(true);
                    },
                  }
                : undefined
            }
            remix={{
              open: remixOpen,
              partnerName: workspace.data?.project.remixPartner?.displayName,
              panelId: remixPanelId,
              onOpen: openRemix,
              onClose: closeRemix,
              panel: (
                <RemixPanel
                  id={remixPanelId}
                  partner={workspace.data?.project.remixPartner}
                  choosing={choosing}
                  chooseError={chooseError}
                  onChoose={(partnerId) => void choosePartner(partnerId)}
                />
              ),
            }}
          />
        </div>
      ) : null}
      {bar ? (
        <div className="fixed inset-x-0 bottom-[var(--space-padding-8)] flex justify-center px-[var(--grid-margin)]">
          <div className="flex w-[calc(var(--size-prompt-width)+var(--size-icon-menu-button)+var(--space-gap-4))] max-w-full items-center gap-[var(--space-gap-4)]">
            {/* 첨부(클립) 버튼은 자리만 둔다. 동작은 첨부 기능(T11)에서. */}
            <span
              aria-hidden="true"
              className="flex size-[var(--size-icon-menu-button)] shrink-0 items-center justify-center rounded-[var(--radius-max)] bg-[color:var(--color-background-default)] text-[color:var(--color-font-sub-text)] shadow-[var(--shadow-prompt)]"
            >
              <ClipIcon />
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
      <FinishModal
        open={finishOpen}
        onOpenChange={setFinishOpen}
        candidates={candidates.data?.answers}
        candidatesError={candidates.error}
        onRetryCandidates={() => void candidates.refetch()}
        steps={{
          finish: (request) => api.finishProject(id, request),
          post: () => api.postProject(id, { posted: true }),
        }}
        onFinished={finished}
        onCloseAutoFocus={(event) => {
          // 완료 직후에는 결과 크게 보기가 이어서 열려서, 끝내기 버튼으로 포커스를 돌려주지 않는다.
          if (resultCover !== null) {
            event.preventDefault();
            return;
          }
          // 모달을 닫으면 끝내기 버튼으로 포커스를 돌려준다.
          if (finishButton.current === null) return;
          event.preventDefault();
          finishButton.current.focus();
        }}
      />
      {resultPath !== null ? (
        <ResultView
          open
          onOpenChange={(open) => {
            if (!open) closeResult();
          }}
          imagePath={resultPath}
          alt={workspace.data?.project.title ?? ''}
          onDownload={() => void download()}
          downloading={downloading}
          {...(downloadError === null ? {} : { errorMessage: COPY[errorCopyKey(downloadError)] })}
        />
      ) : null}
    </section>
  );
}
