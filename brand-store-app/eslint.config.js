import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'drizzle/**',
      '.engram/**',
      'loadtest/**',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // TypeScript sudah memeriksa identifier yang tidak terdefinisi, dan `no-undef`
      // tidak mengenal global Node (process, Buffer, fetch) tanpa daftar env tambahan.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Template ini sengaja memakai `any` di boundary request/response dan test double.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
