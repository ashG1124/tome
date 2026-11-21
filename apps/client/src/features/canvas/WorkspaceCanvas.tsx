import { useLayoutEffect, useState } from 'react';
import type { WorkspaceResponse } from '@tome/shared';
import { Navigate } from 'react-router';
import { CANVAS_COPY, COPY } from '../../shared/copy';
import { CANVAS_GEOMETRY_TOKENS } from '../../shared/tokens';
import { authRedirectTarget, errorCopyKey } from '../../shared/api';
import { ErrorNotice } from '../../shared/ui';
import { useGeneration } from './hooks/useGeneration';
import type { CanvasGeometry } from './model';
import { GenerationCanvas } from './components/GenerationCanvas';

export interface WorkspaceCanvasProps {
  projectId: string;
  pageId: string;
  workspace: WorkspaceResponse;
  onOpenResult?: (answerId: string) => void;
}

function PageCanvas({ projectId, pageId, workspace }: WorkspaceCanvasProps) {
  const [geometry, setGeometry] = useState<CanvasGeometry | null>(null);
  useLayoutEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const css = getComputedStyle(document.documentElement);
      setGeometry(
        Object.fromEntries(
          Object.entries(CANVAS_GEOMETRY_TOKENS).map(([key, token]) => [
            key,
            Number.parseFloat(css.getPropertyValue(token)),
          ]),
        ) as unknown as CanvasGeometry,
      );
    });
    return () => {
      active = false;
    };
  }, []);
  const { generation, announcement, busy, loadError, reload, error } = useGeneration(
    projectId,
    pageId,
    workspace,
  );
  const redirect = authRedirectTarget(error ?? loadError);
  if (redirect) return <Navigate to={redirect} replace />;
  return (
    <div className="workspace-canvas" aria-busy={busy || undefined}>
      {loadError ? (
        <div className="canvas-load-error">
          <ErrorNotice message={COPY[errorCopyKey(loadError)]} onRetry={reload} />
        </div>
      ) : null}
      {geometry ? (
        <GenerationCanvas
          sets={workspace.sets}
          generation={generation}
          labels={CANVAS_COPY}
          geometry={geometry}
          announcement={announcement}
        />
      ) : null}
    </div>
  );
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps) {
  return <PageCanvas key={`${props.projectId}:${props.pageId}`} {...props} />;
}
