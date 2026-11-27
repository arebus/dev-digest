/**
 * Layer rules for checks.sh. Run from server/. Based on
 * .claude/skills/onion-architecture/references/enforcement.md, with pnpm paths
 * matched by package name and type-only imports included.
 */
const npm = (names) => `node_modules/(${names})(/|$)`;

module.exports = {
  forbidden: [
    {
      name: 'no-db-outside-infrastructure',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(routes|service|helpers|constants|types)\\.ts$' },
      to: { path: [npm('drizzle-orm'), '^src/db/(schema|client)'] },
    },
    {
      name: 'no-fastify-in-service-or-domain',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(service|helpers|constants|types)\\.ts$' },
      to: { path: npm('fastify') },
    },
    {
      name: 'sdks-only-in-adapters',
      severity: 'error',
      from: { path: '^src/(modules|platform)/', pathNot: '^src/platform/container\\.ts$' },
      to: { path: npm('octokit|openai|@anthropic-ai/sdk|simple-git|@ast-grep/napi|js-tiktoken') },
    },
    {
      name: 'adapters-not-from-modules',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'domain-not-from-repository',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(helpers|constants|types)\\.ts$' },
      to: { path: '^src/modules/[^/]+/repository' },
    },
    {
      name: 'reviewer-core-is-pure',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: {
        path: [npm('drizzle-orm|octokit|postgres|simple-git'), '^(node:)?fs(/promises)?$', '^src/'],
        pathNot: '^src/vendor/shared/', // the zod contracts are shared with the engine
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
};
