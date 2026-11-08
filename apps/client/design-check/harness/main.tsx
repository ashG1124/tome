import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { cases } from '../cases';
import './harness.css';
import { renders } from './renders';

// dev 전용 비교 하네스: ?case=<case-id> 의 케이스 하나를 정확한 크기의 흰 박스에 그린다.
const caseId = new URLSearchParams(location.search).get('case');
const target = cases.find((c) => c.id === caseId);
const render = target ? renders[target.id] : undefined;

// 스펙이 스크린샷 직전에 호출한다(포커스 등 케이스별 상태 만들기).
(window as unknown as { __designCheckSetup?: () => void }).__designCheckSetup = () => {
  if (target?.focus) {
    document.querySelector<HTMLInputElement>('[data-testid="design-check-target"] input')?.focus();
  }
};

createRoot(document.getElementById('root')!).render(
  target && render ? (
    <div
      data-testid="design-check-target"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: target.width,
        height: target.height,
        margin: 0,
        background: 'white',
      }}
    >
      {render()}
    </div>
  ) : (
    <p>Unknown case: {String(caseId)}</p>
  ),
);
