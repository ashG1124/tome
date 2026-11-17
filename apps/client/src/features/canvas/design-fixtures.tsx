import { CanvasSurface, GenerationImage } from './components/CanvasSurface';
import { CANVAS_COPY } from '../../shared/copy';
import './canvas.css';

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
