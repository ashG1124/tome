import type { Answer, Node, Connection } from '@tome/shared';
import { KeywordEditor } from './components/NodeEditPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { CanvasSurface, GenerationImage } from './components/CanvasSurface';
import { CANVAS_HISTORY_COPY, COPY, CANVAS_COPY, NODE_EDITOR_COPY } from '../../shared/copy';
import { AnswerVersions } from './components/AnswerVersions';
import './canvas.css';
import './history.css';
import { ConnectionPopover } from './components/ConnectionPopover';
import './remix.css';

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
  // 파생 화면 원작자 머리글(시안 Work Space-Derive 1679:15197, My answer 가 활성이라 원작은 비활성). 그림은 머리글 둘레 160×44 를 잘라 쓴다.
  originHeading: () => (
    <div
      className="canvas-heading"
      data-variant="origin"
      data-inactive="true"
      style={{ height: '100%' }}
    >
      <strong>{CANVAS_COPY.derive.origin('shina')}</strong>
    </div>
  ),
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
        description={editorNode.text}
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
        hasPreview={!generating}
        open
        navigation={{
          index: 0,
          count: 2,
          previous: NODE_EDITOR_COPY.preview,
          next: NODE_EDITOR_COPY.preview,
          onPrevious: () => {},
          onNext: () => {},
        }}
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

const designConnection: Connection = {
  id: '00000000-0000-4000-8000-000000000127',
  nodeId: 'design-keyword',
  predictedAction: 'Lean on evidence',
  sentence: 'Leaned on evidence 7 of 10 times',
  status: 'shown',
};
export const remixDesignFixtures = {
  closed: () => (
    <div
      style={{
        width: 'var(--canvas-node-surface-height)',
        height: 'var(--canvas-node-surface-height)',
      }}
    >
      <ConnectionPopover answerId="design-answer" connection={designConnection} />
    </div>
  ),
};
