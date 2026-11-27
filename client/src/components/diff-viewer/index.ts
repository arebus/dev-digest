/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the flat DiffViewer, the role-grouped DiffGroups, and the
   comment + finding contracts. */
export { DiffViewer } from "./DiffViewer";
export { DiffGroups, type DiffGroup } from "./DiffGroups";
export type { DiffCommentApi } from "./comments";
export type { DiffFindingApi } from "./findings";
