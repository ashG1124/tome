import type { Answer, Node } from '@tome/shared';
import { KeywordEditor } from './components/NodeEditPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { CanvasSurface, GenerationImage } from './components/CanvasSurface';
import { CANVAS_HISTORY_COPY, COPY, CANVAS_COPY, NODE_EDITOR_COPY } from '../../shared/copy';
import { AnswerVersions } from './components/AnswerVersions';
import './canvas.css';
import './history.css';

export const canvasDesignFixtures = {
  keyword: () => (
    <div style={{ width: 'var(--canvas-node-width)' }}>
      <CanvasSurface
        data={{
          kind: 'output',
          setId: 'design',
          column: 1,
          row: 0,
          label: '키워드 노드 텍스트',
          text: '키워드 노드 텍스트',
          labels: CANVAS_COPY,
          state: 'done',
        }}
      />
    </div>
  ),
  gradient: () => <GenerationImage />,
};

const editorNode: Node = {
  id: 'design-keyword',
  kind: 'keyword',
  stage: 'analyze',
  enabled: true,
  parentIds: [],
  weight: 1,
  text: 'Relieve the complex structure of the city center, Reflects a refined, relaxing mood',
  pad: { x: -2, y: 3, xAxis: ['Textured', 'Smooth'], yAxis: ['Horizon', 'Surrounding'] },
};
const previewAnswer = { id: 'design-answer', imageUrl: '' } as Answer;
function keywordEditor(tab: 'weight' | 'meaning') {
  return (
    <div style={{ width: 'calc(var(--space-padding-8) * 10)', marginInline: 'auto' }}>
      <KeywordEditor
        node={
          tab === 'meaning'
            ? {
                ...editorNode,
                pad: {
                  ...editorNode.pad!,
                  xAxis: ['Keywords', 'Keywords'],
                  yAxis: ['Keywords', 'Keywords'],
                },
              }
            : editorNode
        }
        labels={NODE_EDITOR_COPY}
        initialTab={tab}
        onChange={() => {}}
      />
    </div>
  );
}
function previewEditor(generating: boolean, image?: string) {
  return (
    <div style={{ padding: 'var(--space-padding-6) var(--space-padding-7)' }}>
      <PreviewPanel
        title={NODE_EDITOR_COPY.preview}
        applyLabel={NODE_EDITOR_COPY.apply}
        statusLabel={generating ? CANVAS_COPY.generating : NODE_EDITOR_COPY.ready}
        generating={generating}
        applying={false}
        canApply={!generating}
        stacked={false}
        answer={previewAnswer}
        onApply={async () => {}}
        renderImage={() =>
          image ? (
            <img src={image} alt="" />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'var(--color-background-default)',
              }}
            />
          )
        }
      />
    </div>
  );
}
export const nodeEditorDesignFixtures = {
  weighting: () => keywordEditor('weight'),
  meaning: () => keywordEditor('meaning'),
  generating: (image?: string) => previewEditor(true, image),
  ready: (image?: string) => previewEditor(false, image),
};

export const canvasHistoryDesignFixtures = {
  corner: () => (
    <div
      style={{
        position: 'relative',
        width: 'calc(var(--size-icon-empty) + var(--space-gap-4))',
        height: 'calc(var(--size-icon-empty) + var(--space-gap-4))',
      }}
    >
      <button type="button" className="canvas-comment-corner" aria-label={COPY['S-07a']} />
    </div>
  ),
  pin: (pinned: boolean) => (
    <div className="canvas-history-pin-fixture">
      <AnswerVersions
        answer={{ ...previewAnswer, number: 1, status: 'accepted', pinned }}
        answers={[]}
        labels={CANVAS_HISTORY_COPY.versions}
        onSelect={() => {}}
        onPin={async () => {}}
      />
    </div>
  ),
};
