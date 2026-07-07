import assert from 'node:assert/strict';
import fs from 'node:fs';

const appCss = fs.readFileSync('src/App.css', 'utf8');

const topbarRule = /\.hero-hall-style-scope\.app-shell\[data-hero-hall='true'\] \.hero-pool-topbar\s*\{(?<body>[^}]*)\}/.exec(appCss)?.groups?.body || '';
const layoutRule = /\.hero-hall-style-scope\.app-shell\[data-hero-hall='true'\] \.hero-pool-layout\s*\{(?<body>[^}]*)\}/.exec(appCss)?.groups?.body || '';
const gridRule = /\.hero-hall-style-scope\.app-shell\[data-hero-hall='true'\] \.hero-armory-grid\.hero-pool-grid\s*\{(?<body>[^}]*)\}/.exec(appCss)?.groups?.body || '';

assert.match(topbarRule, /position:\s*relative/, 'Hero pool topbar must establish its own hit-test layer.');
assert.match(topbarRule, /z-index:\s*[2-9]/, 'Hero pool topbar must stay above the scrollable card grid.');
assert.match(layoutRule, /isolation:\s*isolate/, 'Hero pool layout must isolate its internal stacking order.');
assert.match(layoutRule, /overflow:\s*hidden/, 'Hero pool layout must clip scroll children inside the list slot.');
assert.match(gridRule, /clip-path:\s*inset\(0\)/, 'Hero pool grid must clip transformed or scrolled card descendants.');
assert.match(gridRule, /contain:\s*paint/, 'Hero pool grid must paint-contain scrolled card descendants.');

console.log('Hero pool hit-test containment verified.');
