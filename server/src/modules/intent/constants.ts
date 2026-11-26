/** Per-source limits of the intent classifier input. */
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 4_000;
export const MAX_COMMITS = 20;
export const MAX_COMMIT_CHARS = 200;
export const MAX_FILE_PATHS = 100;
export const MAX_PATCH_CHARS_PER_FILE = 1_500;
export const MAX_PATCH_CHARS_TOTAL = 12_000;
export const MAX_ISSUES = 3;
export const MAX_ISSUE_BODY_CHARS = 4_000;
export const MAX_SPECS = 3;
export const MAX_SPEC_BYTES = 200 * 1024;
export const MAX_SPEC_CHARS = 8_000;
export const MAX_SPECS_TOTAL_CHARS = 20_000;
export const MAX_UNREAD_URLS = 10;
export const MAX_SPEC_PATH_CHARS = 300;
export const MAX_URL_REF_CHARS = 200;

/** Only text documents are ever read as spec/plan files. */
export const SPEC_EXTENSIONS = ['md', 'mdx', 'markdown', 'txt', 'rst', 'adoc'] as const;

/**
 * Extensions recognised for a bare file name with no folder (`txt` is left out:
 * `requirements.txt` and friends are not documents).
 */
export const BARE_FILE_EXTENSIONS = ['md', 'mdx', 'markdown', 'rst', 'adoc'] as const;

/** Repo boilerplate: naming one of these bare does not point at a spec or plan. */
export const GENERIC_DOC_RE =
  /^(?:readme|changelog|contributing|license|security|code_of_conduct|claude|agents|insights)\./i;

/** Common first segments of branch names that contain `/`. */
export const BRANCH_PREFIX_RE =
  /^(?:feat|feature|fix|bugfix|hotfix|release|chore|docs|refactor|test|ci|users|dependabot|renovate)$/i;

/** Confidence thresholds (characters / commit subject length). */
export const MIN_DESCRIPTION_CHARS = 120;
export const MIN_PARTIAL_DESCRIPTION_CHARS = 20;
export const MIN_COMMIT_CHARS = 15;

/** Commit subjects that say nothing about intent. `fix: …` / `fix(x): …` stay meaningful. */
export const TRIVIAL_COMMIT_RE =
  /^(?:(?:wip|merge)\b|(?:fixup|squash)!|(?:fix|fixes|fixed|update|updates|updated)\b(?!\s*[(:!]))/i;

/** Model call. Bump the version whenever the prompt or the input layout changes. */
export const INTENT_PROMPT = 'intent.system.md';
export const INTENT_PROMPT_VERSION = '1';
export const INTENT_SCHEMA_NAME = 'PrIntentExtraction';
export const INTENT_TIMEOUT_MS = 45_000;

/** Limits applied to the model's answer. */
export const MAX_SCOPE_ITEMS = 8;
export const MAX_CRITERIA = 10;
export const MAX_RISKS = 6;
export const MAX_INTENT_CHARS = 500;
export const MAX_ITEM_CHARS = 200;
export const MAX_RISK_TITLE_CHARS = 120;
export const MAX_RISK_EXPLANATION_CHARS = 500;
export const MAX_RISK_FILE_REFS = 10;
