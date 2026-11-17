import type { IdentityTableRow } from '@tome/shared';
import { COPY } from '../../shared/copy';
import { axisRows } from './identity';
import { axisName } from './labels';

interface AxisTableProps {
  table: readonly IdentityTableRow[];
}

/** 좌표 그림을 대신하는 화면 읽기 프로그램용 숨김 표. 점수가 없으면 "—". */
export function AxisTable({ table }: AxisTableProps) {
  return (
    <table className="sr-only">
      <caption>{COPY['P-19a']}</caption>
      <thead>
        <tr>
          <th scope="col">{COPY['P-19b']}</th>
          <th scope="col">{COPY['P-19c']}</th>
        </tr>
      </thead>
      <tbody>
        {axisRows(table).map((row) => (
          <tr key={row.axis}>
            <th scope="row">{axisName(row.axis)}</th>
            <td>{row.score === null ? '—' : row.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
