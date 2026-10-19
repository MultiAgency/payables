// Payables release contract check (P2 manifest v1, P3 owner contract).
// 1. Every capability web/public/contract.json declares exists in the vendored contract's map.
// 2. With --proto <snapshot>, every source the vendored package records is byte-identical there.
// 3. The actual build graph (both entries, including the supplier page that the copied backend still
//    serves) bundles no module from Payables' own src/: the app builds against the published contract.
// 4. That graph type-checks with the client narrowed to the declared procedures, so a call outside the
//    manifest fails here. No bundled module keeps module-level query options (they would outlive an account switch),
//    and no procedure that sends, saves or signs goes through query-library options or useMutation (no retry can repeat it). The pin itself is checked offline by test/contract-drift.test.ts.
// Compatibility is not authorization: the gateway and agent still authorize every call.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mayCall, ownerCapabilities } from '@multiagency/sdk';
import { sdkMode } from './release-mode.mjs';
import { API } from 'typescript/unstable/sync';

const repo = fileURLToPath(new URL('../', import.meta.url)), web = join(repo, 'web');
const failures = [], fail = message => failures.push(message);
const at = process.argv.indexOf('--proto'), proto = at === -1 ? undefined : resolve(process.argv[at + 1] ?? '');

// 1. Declared capabilities.
const manifest = JSON.parse(readFileSync(join(web, 'public/contract.json'), 'utf8'));
if (manifest.version !== 1 || manifest.product !== 'payables') fail('contract.json must declare version 1 and product "payables"');
const declared = [...manifest.required, ...(manifest.optional ?? [])];
for (const name of declared) if (!Object.hasOwn(ownerCapabilities, name)) fail(`Unknown capability: ${name}`);
const procedures = [...new Set(declared.filter(name => Object.hasOwn(ownerCapabilities, name)).flatMap(name => ownerCapabilities[name].procedures))].sort();
// Every procedure a viewer with no rights may not call sends, saves or signs. The query library may cache, retry and refetch reads only.
const NONE = { canSign: false, canPropose: false, canVote: false, canExecute: false, canManage: false };
const sends = new Set(Object.values(ownerCapabilities).flatMap(capability => capability.procedures).filter(procedure => !mayCall(NONE, procedure)));

// 2. A release candidate's package sources against the snapshot they were built from. A dev link is that source.
if (proto && sdkMode().mode === 'dev') fail('--proto checks a release candidate\'s vendored SDK; this build uses a dev link');
else if (proto) {
  const { sources } = JSON.parse(readFileSync(join(repo, 'node_modules/@multiagency/sdk/provenance.json'), 'utf8'));
  for (const [path, sha256] of Object.entries(sources)) {
    const file = join(proto, path);
    if (!existsSync(file) || createHash('sha256').update(readFileSync(file)).digest('hex') !== sha256) fail(`Package source differs from ${proto}: ${path}`);
  }
}

// 3. Modules placed in emitted chunks by the real build, not merely parsed.
const { createRsbuild, loadConfig } = await import('@rsbuild/core');
const { content } = await loadConfig({ cwd: web });
content.logLevel = 'error';
const out = mkdtempSync(join(tmpdir(), 'payables-frontend-graph-'));
const bundled = new Set();
try {
  const rsbuild = await createRsbuild({ cwd: web, rsbuildConfig: { ...content, output: { ...content.output, distPath: { root: out }, cleanDistPath: false },
    tools: { ...content.tools, rspack: config => {
      config.plugins.push({ apply(compiler) { compiler.hooks.done.tap('payables-frontend-graph', stats => {
        const compilation = stats.compilation;
        for (const chunk of compilation.chunks) for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk))
          for (const entry of [module, ...(module.modules ?? [])]) if (entry.resource) bundled.add(entry.resource.split('?')[0]);
      }); } });
      return config;
    } } } });
  await rsbuild.build();
  for (const file of [...Object.values(manifest.entries ?? {}), manifest.fallback].filter(Boolean))
    if (!existsSync(join(out, file))) fail(`Declared release file missing from the build: ${file}`);
} finally { rmSync(out, { recursive: true, force: true }); }
const app = [...bundled].filter(path => path.startsWith(repo) && !path.includes('/node_modules/') && /\.[cm]?[jt]sx?$/.test(path));
if (!app.length) fail('The build reported no application modules');
for (const path of app) if (path.startsWith(join(repo, 'src') + '/')) fail(`The build bundles the copied backend: ${path.slice(repo.length)}`);
// Syntax guards over every bundled web module (parsed, so aliases and formatting can't hide a use).
const { parse } = await import('@babel/parser');
const OPTIONS = new Set(['queryOptions', 'mutationOptions', 'streamedOptions', 'liveOptions', 'infiniteOptions']);
const QUERY_FUNCTIONS = new Set(['queryFn', 'mutationFn']);
const isFunction = node => ['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration', 'ObjectMethod'].includes(node.type);
/** A member chain's root identifier and property names, e.g. `api.compensation.send` → api, [compensation, send]. */
function chain(node) {
  const names = [];
  for (; node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression'; node = node.object) {
    if (node.computed || node.property.type !== 'Identifier') return null;
    names.unshift(node.property.name);
  }
  return node?.type === 'Identifier' ? { root: node.name, names } : null;
}
/** The send a chain names, whatever object it hangs from (`client.pay`, `api.owner.submit`, `queries.orpc.sweep`). */
const sendIn = names => names.map((_, i) => names.slice(i).join('/')).find(path => sends.has(path));
function walk(node, visit) {
  if (!node || typeof node.type !== 'string' || visit(node) === false) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key.endsWith('Comments')) continue;
    for (const child of Array.isArray(value) ? value : [value]) if (child && typeof child.type === 'string') walk(child, visit);
  }
}
for (const path of app.filter(path => path.startsWith(join(web, 'src') + '/'))) {
  const file = path.slice(repo.length), ast = parse(readFileSync(path, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  walk(ast.program, node => {
    // Sends stay on the app's explicit controls, never in query-library options, queryFn or mutationFn, so nothing can retry one.
    if (node.type === 'CallExpression') {
      const callee = chain(node.callee), send = callee && OPTIONS.has(callee.names.at(-1)) && sendIn(callee.names.slice(0, -1));
      if (send) fail(`A send is wrapped in query-library ${callee.names.at(-1)}: ${file}: ${send}`);
    }
    const key = (node.type === 'ObjectProperty' || node.type === 'ObjectMethod') && node.key.type === 'Identifier' ? node.key.name : undefined;
    if (QUERY_FUNCTIONS.has(key)) walk(node.type === 'ObjectMethod' ? node.body : node.value, inner => {
      const send = inner.type === 'CallExpression' && sendIn(chain(inner.callee)?.names ?? []);
      if (send) fail(`A send runs inside ${key}: ${file}: ${send}`);
    });
  });
  // Agent reads are rebuilt when the signed-in account changes; a module-level copy would keep the earlier account's keys.
  // The account-scoped bindings under any local name (`import { queries as q }`, `import * as m` then `m.queries`).
  const scoped = new Set(['queries', 'payablesQueries']), local = new Set(scoped), namespaces = new Set();
  for (const statement of ast.program.body) if (statement.type === 'ImportDeclaration') for (const specifier of statement.specifiers) {
    if (specifier.type === 'ImportSpecifier' && scoped.has(specifier.imported.name ?? specifier.imported.value)) local.add(specifier.local.name);
    if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(specifier.local.name);
  }
  const readsScoped = c => c && c.names.length && (local.has(c.root) || (namespaces.has(c.root) && scoped.has(c.names[0]) && c.names.length > 1));
  for (const statement of ast.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'VariableDeclaration') for (const { id, init } of declaration.declarations) walk(init, node => {
      if (isFunction(node)) return false;
      if (readsScoped(chain(node))) fail(`Module-level query options outlive an account switch: ${file}: ${id.name ?? 'declaration'}`);
    });
  }
}

// 4. Type-check the entries' import graph with the client narrowed to the declared procedures (in memory only).
const config = join(web, '.payables-frontend-contract.tsconfig.json'), clientFile = join(web, 'src/shared/client.ts');
const alias = 'export type ClientProcedure = OwnerProcedure;';
const narrowedTo = `export type ClientProcedure = ${procedures.map(procedure => JSON.stringify(procedure)).join(' | ') || 'never'};`;
const tsconfig = JSON.stringify({ extends: './tsconfig.json', files: ['./src/main.tsx', './src/contributor.tsx', './src/env.d.ts'], include: [] });
let narrowed = false;
const api = new API({ cwd: repo, fs: {
  fileExists: path => resolve(path) === config ? true : undefined,
  readFile: path => {
    path = resolve(path);
    if (path === config) return tsconfig;
    if (path !== clientFile) return undefined;
    const source = readFileSync(path, 'utf8');
    narrowed = source.includes(alias);
    return source.replace(alias, narrowedTo);
  },
} });
try {
  const snapshot = api.updateSnapshot({ openProjects: [config] });
  try {
    const project = snapshot.getProject(config);
    if (!project) throw new Error('The contract check project did not load');
    const program = project.program;
    if (!narrowed) fail(`web/src/shared/client.ts no longer declares "${alias}"; review this check`);
    for (const d of [...program.getConfigFileParsingDiagnostics(), ...program.getProgramDiagnostics(), ...program.getSyntacticDiagnostics(),
      ...program.getGlobalDiagnostics(), ...program.getSemanticDiagnostics()])
      fail(`Undeclared or invalid use: ${(d.fileName ?? config).replace(repo, '')}: TS${d.code}: ${d.text}`);
    const checked = new Set(program.getSourceFileNames().map(name => resolve(name)));
    for (const path of app) if (!checked.has(path)) fail(`Bundled module outside the checked graph: ${path.slice(repo.length)}`);
    for (const path of checked) if (path.startsWith(join(repo, 'src') + '/')) fail(`The build's type graph uses the copied backend: ${path.slice(repo.length)}`);
  } finally { snapshot.dispose(); }
} finally { api.close(); }

if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Payables frontend contract holds: ${app.length} bundled modules, ${declared.length} declared capabilities, ${procedures.length} procedures${proto ? ', package sources match the snapshot' : ''}.`);
