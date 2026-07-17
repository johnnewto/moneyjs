import {
  isNotebookTemplateLoadable,
  NOTEBOOK_TEMPLATES,
  type NotebookTemplateId
} from "../notebook/templates";
import type { PublicationRouteLocation } from "./publicationRouteHelpers";
import {
  buildPublicationPathname,
  navigateToPublicationView
} from "./publicationRouteHelpers";

const LIVE_SELECT_VALUE = "__live__";

export function PublicationNotebookPicker({
  id,
  route
}: {
  id: string;
  route: PublicationRouteLocation;
}) {
  const selectedValue =
    route.source === "live" ? LIVE_SELECT_VALUE : (route.templateId ?? LIVE_SELECT_VALUE);

  return (
    <label className="publication-notebook-picker">
      <span className="publication-notebook-picker-label">Notebook</span>
      <select
        id={id}
        aria-label="Notebook"
        value={selectedValue}
        onChange={(event) => {
          const value = event.target.value;
          if (value === LIVE_SELECT_VALUE || !value) {
            return;
          }

          navigateToPublicationView(
            buildPublicationPathname({
              mode: "publish",
              templateId: value as NotebookTemplateId
            })
          );
        }}
      >
        {route.source === "live" ? (
          <option value={LIVE_SELECT_VALUE}>Current notebook (live)</option>
        ) : null}
        {Object.values(NOTEBOOK_TEMPLATES).map((template) => {
          const loadable = isNotebookTemplateLoadable(template.id);
          return (
            <option key={template.id} value={template.id} disabled={!loadable}>
              {loadable ? template.label : `${template.label} (unavailable)`}
            </option>
          );
        })}
      </select>
    </label>
  );
}
