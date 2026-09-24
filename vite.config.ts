import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 打包成单个 HTML 文件，手机上打开或直接发给别人都方便。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
