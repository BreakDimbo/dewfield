import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const LAYERS = ['state', 'render', 'ui', 'audio', 'platform', 'debug', 'app'];
const layer = (name) => [`@/${name}`, `@/${name}/*`];

/** Static imports of these are banned for the given layer (03 §4). `@/debug` may only be `import()`ed. */
function restrict(message, ...patterns) {
  return [
    'error',
    {
      patterns: [
        ...(patterns.flat().length ? [{ group: patterns.flat(), message }] : []),
        { group: layer('debug'), message: 'debug is lazy: use import() only (03 §4).' },
      ],
    },
  ];
}

const coreBanned = [
  'react',
  'react/*',
  'react-dom',
  'react-dom/*',
  'three',
  'three/*',
  '@react-three/*',
  'zustand',
  'zustand/*',
  'howler',
  'maath',
  'maath/*',
  'leva',
  ...LAYERS.flatMap(layer),
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'test-results', 'playwright-report', 'docs', 'uploads'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-imports': restrict('core is pure TS: only zod and core itself (03 §4).', coreBanned),
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'performance', 'requestAnimationFrame', 'navigator'].map(
          (name) => ({ name, message: 'core must not touch browser globals (03 §4).' }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use core/rng (03 §5.5).' },
        { object: 'Date', property: 'now', message: 'Pass nowMs in from platform/clock (03 §5.5).' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'No wall clock in core (03 §5.5).' },
        { selector: "CallExpression[callee.name='Date']", message: 'No wall clock in core (03 §5.5).' },
      ],
    },
  },
  {
    files: ['src/state/**/*.ts', 'src/state/**/*.tsx'],
    rules: {
      'no-restricted-imports': restrict(
        'state may depend on core, platform and zustand only (03 §4).',
        ['three', 'three/*', '@react-three/*', ...layer('render'), ...layer('ui'), ...layer('audio')],
      ),
    },
  },
  {
    files: ['src/render/**/*.ts', 'src/render/**/*.tsx'],
    rules: {
      'no-restricted-imports': restrict('render must not import ui or audio (03 §4).', [...layer('ui'), ...layer('audio')]),
    },
  },
  {
    files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
    rules: {
      'no-restricted-imports': restrict(
        'ui must not import three, render or audio (03 §4).',
        ['three', 'three/*', '@react-three/*', ...layer('render'), ...layer('audio')],
      ),
    },
  },
  {
    files: ['src/audio/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict('audio must not import render or ui (03 §4).', [...layer('render'), ...layer('ui')]),
    },
  },
  {
    files: ['src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict('platform must not import app layers (03 §4).', [
        ...layer('state'),
        ...layer('render'),
        ...layer('ui'),
        ...layer('audio'),
      ]),
    },
  },
  {
    files: ['src/app/**/*.ts', 'src/app/**/*.tsx', 'src/main.tsx'],
    rules: { 'no-restricted-imports': restrict('app may import everything except debug statically.', []) },
  },
  {
    files: ['tools/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-imports': restrict('tools run in Node: core only (03 §4).', [
        'react',
        'react/*',
        'three',
        'three/*',
        '@react-three/*',
        ...layer('state'),
        ...layer('render'),
        ...layer('ui'),
        ...layer('audio'),
        ...layer('platform'),
        ...layer('app'),
      ]),
    },
  },
  {
    files: ['tools/assets/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict('asset tools may read render/assets and three, nothing stateful (00 D-37).', [
        ...layer('state'),
        ...layer('ui'),
        ...layer('audio'),
        ...layer('platform'),
        ...layer('app'),
      ]),
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['*.config.ts', '*.config.js', 'scripts/**/*.js', 'scripts/**/*.mjs', 'tools/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
