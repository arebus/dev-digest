import type { SmartDiffRole } from '@devdigest/shared';

/** Order the groups are reviewed (and returned) in. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

export interface RoleRule {
  role: Exclude<SmartDiffRole, 'core'>;
  pattern: RegExp;
}

/**
 * Checked top to bottom, first match wins; a path matching nothing is `core`.
 * Order is boilerplate → tests → wiring → docs, so a snapshot under `__tests__/`
 * is boilerplate, `e2e/README.md` is tests and `.claude/**\/*.md` is wiring.
 * Patterns run against the full POSIX path.
 */
export const ROLE_RULES: readonly RoleRule[] = [
  // boilerplate
  { role: 'boilerplate', pattern: /\.lock$/ },
  { role: 'boilerplate', pattern: /(^|\/)pnpm-lock\.yaml$/ },
  { role: 'boilerplate', pattern: /(^|\/)package-lock\.json$/ },
  { role: 'boilerplate', pattern: /(^|\/)yarn\.lock$/ },
  { role: 'boilerplate', pattern: /(^|\/)(dist|build|__snapshots__)\// },
  { role: 'boilerplate', pattern: /\.snap$/ },
  { role: 'boilerplate', pattern: /\.generated\./ },
  { role: 'boilerplate', pattern: /\.min\.js$/ },
  // tests
  { role: 'tests', pattern: /\.(test|spec)\.[cm]?[jt]sx?$/ },
  { role: 'tests', pattern: /(^|\/)(test|tests|__tests__|e2e)\// },
  // wiring
  { role: 'wiring', pattern: /(^|\/)index\.[cm]?[jt]sx?$/ },
  { role: 'wiring', pattern: /\.config\.[^/]+$/ },
  { role: 'wiring', pattern: /(^|\/)tsconfig[^/]*\.json$/ },
  { role: 'wiring', pattern: /(^|\/)\.eslintrc[^/]*$/ },
  { role: 'wiring', pattern: /(^|\/)\.env[^/]*$/ },
  { role: 'wiring', pattern: /(^|\/)docker-compose[^/]*\.ya?ml$/ },
  { role: 'wiring', pattern: /(^|\/)\.github\// },
  { role: 'wiring', pattern: /(^|\/)\.claude\// },
  // docs
  { role: 'docs', pattern: /\.mdx?$/i },
  { role: 'docs', pattern: /(^|\/)docs\// },
  { role: 'docs', pattern: /(^|\/)README[^/]*$/ },
  { role: 'docs', pattern: /(^|\/)CHANGELOG[^/]*$/ },
  { role: 'docs', pattern: /(^|\/)LICENSE[^/]*$/ },
];
