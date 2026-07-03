import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Supabase join results are pervasively cast; tightening this is a
      // codebase-wide refactor, not a lint rule flip.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `declare global { namespace Express … }` is the canonical way to
      // augment req.user; only ambient declarations are allowed.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },
);
