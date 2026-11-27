/* DiffGroups — the diff split into collapsible role sections (core, tests, …),
   each listing its FileCards and how many of them carry open findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { disclosureProps } from "@/lib/a11y";
import type { DiffCommentApi } from "../comments";
import {
  countFilesWithOpenFindings,
  openFindings,
  worstSeverity,
  type DiffFindingApi,
} from "../findings";
import { FileCard } from "../FileCard";
import { s, chevronFor, groupSwatchFor } from "../styles";
import { COLLAPSED_BY_DEFAULT, ROLE_MESSAGE_KEY, ROLE_SWATCH } from "./constants";

export interface DiffGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

interface DiffGroupProps {
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}

function GroupSection({ group, commenting, findings }: DiffGroupProps & { group: DiffGroup }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!COLLAPSED_BY_DEFAULT.has(group.role));
  const paths = group.files.map((f) => f.path);
  const flagged = findings ? countFilesWithOpenFindings(paths, findings.byFile) : 0;
  const worst = worstSeverity(openFindings(paths.flatMap((p) => findings?.byFile.get(p) ?? [])));
  const keys = ROLE_MESSAGE_KEY[group.role];

  return (
    <div role="group" aria-label={t(keys.label)}>
      <div {...disclosureProps(open, () => setOpen((o) => !o))} style={s.groupHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={groupSwatchFor(ROLE_SWATCH[group.role])} />
        <span style={s.groupLabel}>{t(keys.label)}</span>
        <span style={s.groupHint}>{t(keys.hint)}</span>
        {worst && (
          <span
            className="tnum"
            role="img"
            aria-label={t("smartDiff.filesWithFindings", { count: flagged })}
            style={{ ...s.groupMeta, color: SEV[worst].c }}
          >
            ● {flagged}
          </span>
        )}
        <span style={s.groupMeta}>{t("smartDiff.filesCount", { count: group.files.length })}</span>
      </div>
      {open && (
        <div style={s.list}>
          {group.files.map((f) => (
            <FileCard key={f.path} file={f} commenting={commenting} findings={findings} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiffGroups({
  groups,
  commenting,
  findings,
}: DiffGroupProps & { groups: DiffGroup[] }) {
  return (
    <div style={s.list}>
      {groups.map((group) => (
        <GroupSection
          key={group.role}
          group={group}
          commenting={commenting}
          findings={findings}
        />
      ))}
    </div>
  );
}
