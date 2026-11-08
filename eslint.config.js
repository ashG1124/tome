import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const clientFiles = ['apps/client/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/client/design-check/results/**',
      '.tome-docs/**',
      'design-ref/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  // 클라이언트: 브라우저 전역, React 규칙
  {
    ...reactHooks.configs.flat.recommended,
    files: clientFiles,
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    ...reactRefresh.configs.vite,
    files: clientFiles,
  },
  // 설정·테스트 도구 파일은 Node 에서 돈다
  {
    files: [
      'apps/client/*.config.ts',
      'apps/client/scripts/**',
      'apps/client/e2e/**',
      'apps/client/design-check/*.ts',
      'apps/client/**/*.test.{ts,tsx}',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  // 클라이언트 경계 규칙
  {
    files: ['apps/client/src/**/*.{ts,tsx}', 'apps/client/design-check/**/*.{ts,tsx}'],
    rules: {
      // 기능 폴더(features/<이름>)는 index.ts 로 내보낸 것만 밖에서 쓴다.
      // 규칙이 경로 패턴이라 features 폴더가 없거나 비어 있어도 설정이 깨지지 않는다.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*/**'],
              message:
                'Do not import files inside a feature folder directly. Use what its index.ts exports.',
            },
          ],
        },
      ],
      // 사용자 입력은 텍스트로만 그린다.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Do not insert HTML. Render user input as text.',
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Do not insert HTML. Render user input as text.',
        },
      ],
    },
  },
  // React Flow 는 features/canvas 안에서만 쓴다.
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    ignores: ['apps/client/src/features/canvas/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@xyflow/*'],
              message: 'Import @xyflow/react only inside features/canvas.',
            },
            {
              group: ['**/features/*/**'],
              message:
                'Do not import files inside a feature folder directly. Use what its index.ts exports.',
            },
          ],
        },
      ],
    },
  },
  // Turn off rules that conflict with prettier formatting
  prettier,
);
