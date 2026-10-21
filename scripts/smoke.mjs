#!/usr/bin/env node
/**
 * Reproducible offline smoke for the Code2Flow product path.
 * A copied synthetic fixture and generated export stay in a temp directory.
 */
import { mkdtemp, cp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = await mkdtemp(path.join(os.tmpdir(), 'code2flow-smoke-'));
const fixture = path.join(temp, 'fixture');
const exported = path.join(temp, 'export');

try {
  await run('npm', ['run', 'build'], { cwd: root });
  await cp(path.join(root, 'fixtures/synthetic/static-site'), fixture, { recursive: true });
  const scan = await run('npm', ['run', 'cli', '--', 'scan', fixture], { cwd: root });
  const graph = JSON.parse(await readFile(path.join(fixture, '.code2flow/graph.json'), 'utf8'));
  await run('npm', ['run', 'cli', '--', 'export', fixture, '--out', exported], { cwd: root });
  const files = await readdir(exported);
  const html = await readFile(path.join(exported, files[0]), 'utf8');
  if (graph.screens.length < 1 || graph.edges.length < 1) throw new Error('synthetic fixture produced an empty graph');
  if (files.length !== 1 || !html.includes('Code2Flow')) throw new Error('offline HTML export was not created');
  console.log(JSON.stringify({ status: 'PASS', adapter: 'Static HTML', screens: graph.screens.length, edges: graph.edges.length, export: files[0], scanOutput: scan.stdout.trim().split('\n').at(-2) }));
} finally {
  await rm(temp, { recursive: true, force: true });
}
