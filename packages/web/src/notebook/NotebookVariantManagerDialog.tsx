import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  isNotebookTemplateLoadable,
  NOTEBOOK_TEMPLATES,
  type NotebookTemplateId,
  isNotebookTemplateId
} from "./templates";
import type { NotebookVariantIndexEntry } from "./notebookVariants";

export function NotebookVariantManagerDialog({
  activeVariantId,
  currentDerivedFrom,
  isOpen,
  onClose,
  onCreateFromTemplate,
  onCreateFromCurrent,
  onDelete,
  onOpenVariant,
  onRename,
  variants
}: {
  activeVariantId: string | null;
  currentDerivedFrom: NotebookTemplateId | null;
  isOpen: boolean;
  onClose: () => void;
  onCreateFromTemplate(templateId: NotebookTemplateId, title: string): void;
  onCreateFromCurrent(title: string): void;
  onDelete(variantId: string): void;
  onOpenVariant(variantId: string): void;
  onRename(variantId: string, title: string): void;
  variants: NotebookVariantIndexEntry[];
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [newTemplateId, setNewTemplateId] = useState<NotebookTemplateId>(
    currentDerivedFrom ?? "bmw"
  );
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newCurrentTitle, setNewCurrentTitle] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setNewTemplateId(currentDerivedFrom ?? "bmw");
    setNewTemplateTitle("");
    setNewCurrentTitle("");
  }, [currentDerivedFrom, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const groupedVariants = useMemo(() => {
    const byTemplate = new Map<string, NotebookVariantIndexEntry[]>();

    for (const entry of variants) {
      const key = entry.derivedFrom ?? "__imported__";
      const group = byTemplate.get(key) ?? [];
      group.push(entry);
      byTemplate.set(key, group);
    }

    const templateGroups = Object.values(NOTEBOOK_TEMPLATES)
      .map((template) => ({
        key: template.id,
        label: template.label,
        entries: byTemplate.get(template.id) ?? []
      }))
      .filter((group) => group.entries.length > 0);

    const imported = byTemplate.get("__imported__") ?? [];

    return { templateGroups, imported };
  }, [variants]);

  if (!isOpen) {
    return null;
  }

  function handleRename(entry: NotebookVariantIndexEntry): void {
    const nextTitle = window.prompt("Rename variant", entry.title);
    if (nextTitle == null) {
      return;
    }

    onRename(entry.id, nextTitle);
  }

  function handleDelete(entry: NotebookVariantIndexEntry): void {
    const confirmed = window.confirm(
      `Delete “${entry.title}”? This removes the saved copy from this browser and cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    onDelete(entry.id);
  }

  function handleCreateFromTemplate(event: FormEvent): void {
    event.preventDefault();
    if (!isNotebookTemplateId(newTemplateId)) {
      return;
    }

    const title =
      newTemplateTitle.trim() || `${NOTEBOOK_TEMPLATES[newTemplateId].label} variant`;
    onCreateFromTemplate(newTemplateId, title);
    setNewTemplateTitle("");
  }

  function handleCreateFromCurrent(event: FormEvent): void {
    event.preventDefault();
    const title = newCurrentTitle.trim();
    if (!title) {
      return;
    }

    onCreateFromCurrent(title);
    setNewCurrentTitle("");
  }

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="notebook-variant-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notebook-variant-manager-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="notebook-variant-manager-header">
          <h3 id="notebook-variant-manager-title">Manage notebook variants</h3>
          <button type="button" className="notebook-run-button" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="notebook-variant-manager-intro">
          Variants are saved copies tied to a template (for example BMW shock 1). Pick a template for
          a fresh copy, or save the notebook you have open now.
        </p>

        <section className="notebook-variant-manager-section" aria-label="Saved variants">
          {variants.length === 0 ? (
            <p className="notebook-variant-manager-empty">No saved variants yet.</p>
          ) : (
            <>
              {groupedVariants.templateGroups.map((group) => (
                <div key={group.key} className="notebook-variant-manager-group">
                  <h4>{group.label}</h4>
                  <ul className="notebook-variant-manager-list">
                    {group.entries.map((entry) => (
                      <VariantRow
                        key={entry.id}
                        entry={entry}
                        isActive={entry.id === activeVariantId}
                        onDelete={() => handleDelete(entry)}
                        onOpen={() => onOpenVariant(entry.id)}
                        onRename={() => handleRename(entry)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
              {groupedVariants.imported.length > 0 ? (
                <div className="notebook-variant-manager-group">
                  <h4>Imported</h4>
                  <ul className="notebook-variant-manager-list">
                    {groupedVariants.imported.map((entry) => (
                      <VariantRow
                        key={entry.id}
                        entry={entry}
                        isActive={entry.id === activeVariantId}
                        onDelete={() => handleDelete(entry)}
                        onOpen={() => onOpenVariant(entry.id)}
                        onRename={() => handleRename(entry)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </section>

        <form className="notebook-variant-manager-form" onSubmit={handleCreateFromTemplate}>
          <h4>New from template</h4>
          <div className="notebook-variant-manager-form-row">
            <label>
              Template
              <select
                value={newTemplateId}
                onChange={(event) => setNewTemplateId(event.target.value as NotebookTemplateId)}
              >
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
            <label>
              Name
              <input
                type="text"
                value={newTemplateTitle}
                placeholder="e.g. BMW shock 1"
                onChange={(event) => setNewTemplateTitle(event.target.value)}
              />
            </label>
            <button type="submit">Create</button>
          </div>
        </form>

        <form className="notebook-variant-manager-form" onSubmit={handleCreateFromCurrent}>
          <h4>Save copy of current notebook</h4>
          <div className="notebook-variant-manager-form-row">
            <label>
              Name
              <input
                type="text"
                value={newCurrentTitle}
                placeholder="e.g. BMW shock 2"
                onChange={(event) => setNewCurrentTitle(event.target.value)}
              />
            </label>
            <button type="submit">Save as variant</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VariantRow({
  entry,
  isActive,
  onDelete,
  onOpen,
  onRename
}: {
  entry: NotebookVariantIndexEntry;
  isActive: boolean;
  onDelete(): void;
  onOpen(): void;
  onRename(): void;
}) {
  return (
    <li className={`notebook-variant-manager-item${isActive ? " is-active" : ""}`}>
      <span className="notebook-variant-manager-item-title">{entry.title}</span>
      <span className="notebook-variant-manager-item-id">{entry.id}</span>
      <div className="notebook-variant-manager-item-actions">
        <button type="button" className="notebook-run-button" onClick={onOpen}>
          Open
        </button>
        <button type="button" className="notebook-run-button" onClick={onRename}>
          Rename
        </button>
        <button type="button" className="notebook-run-button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}
