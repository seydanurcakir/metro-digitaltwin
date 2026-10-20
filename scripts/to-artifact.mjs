// Converts the Vite output to the Artifact page format: no <html>/<head>/<body> skeleton, title first.
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const rest = head.replace(title, '');
writeFileSync('dist/metro-twin.html', `${title}\n${rest.trim()}\n${body.trim()}\n`);
console.log('dist/metro-twin.html', (readFileSync('dist/metro-twin.html').length / 1024).toFixed(0), 'KB');
