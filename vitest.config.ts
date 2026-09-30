import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Match tsconfig's "@/*" → "src/*". Without it only type-only imports from
    // "@/..." work in tests, because those are erased before they resolve.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: ['node_modules', 'tests', '.next'],
    passWithNoTests: true,
  },
});
