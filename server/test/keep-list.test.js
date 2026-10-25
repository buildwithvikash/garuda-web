// Every screen on the shop-floor keep-list has a form spec and a menu entry (no database needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEEP } from '../src/data/menu/keep.js';

const forms = JSON.parse(readFileSync(new URL('../src/data/forms/forms.json', import.meta.url), 'utf8'));
const menu = JSON.parse(readFileSync(new URL('../src/data/menu/menu.json', import.meta.url), 'utf8'));
const routeOf = (url) => (url ? '/' + url.replace(/^View\//i, '').replace(/\.aspx$/i, '').toLowerCase() : null);
const menuRoutes = new Set();
(function walk(ns) {
  for (const n of ns) {
    menuRoutes.add(routeOf(n.url));
    walk(n.children);
  }
})(menu);

test('each kept screen has a form spec', () => {
  assert.deepEqual([...KEEP].filter((r) => !forms[r]), []);
});

test('each kept screen has a menu entry', () => {
  assert.deepEqual([...KEEP].filter((r) => !menuRoutes.has(r)), []);
});
