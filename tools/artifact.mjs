// 把 dist/index.html（完整 HTML 文档）转成 claude.ai Artifact 用的页面片段：
// 平台发布时会自己套上 <!doctype>/<html>/<head>/<body>，所以这里只保留
// <title>、<style>、页面内容和内联脚本，输出到 dist/artifact.html。
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`dist/index.html 里找不到 ${what}`);
  return m;
};
const title = pick(/<title>[\s\S]*?<\/title>/, '<title>')[0];
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...html.matchAll(/<script type="module"[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0].replace(' crossorigin', ''));
const body = pick(/<body>([\s\S]*)<\/body>/, '<body>')[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
if (!scripts.length) throw new Error('没有找到内联脚本，先运行 npm run build');
const out = [title, ...styles, body, ...scripts].join('\n');
writeFileSync('dist/artifact.html', out + '\n');
console.log(`dist/artifact.html: ${(out.length / 1024).toFixed(1)} KB`);
