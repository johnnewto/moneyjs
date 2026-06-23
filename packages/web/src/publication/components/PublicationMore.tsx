import { useId, useState } from "react";

import { PublicationMarkdown } from "./PublicationMarkdown";
import type { PublicationVariableInteraction } from "../publicationInspect";

export function PublicationMore({
  interaction,
  source
}: {
  interaction: PublicationVariableInteraction;
  source: string;
}) {
  const [open, setOpen] = useState(true);
  const panelId = useId();

  if (!source.trim()) {
    return null;
  }

  return (
    <div className="publication-more">
      {open ? (
        <div id={panelId} className="publication-more-panel">
          <PublicationMarkdown interaction={interaction} source={source} />
        </div>
      ) : null}
      <div className="publication-more-row">
        <button
          type="button"
          className="publication-more-toggle publication-no-print"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "less" : "more"}
        </button>
      </div>
    </div>
  );
}
