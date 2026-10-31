import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 상대 경로로 빌드해서 GitHub Pages의 레포 이름(/<repo>/)과 무관하게 동작하도록 한다.
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
