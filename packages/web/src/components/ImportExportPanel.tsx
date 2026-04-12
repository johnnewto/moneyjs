interface ImportExportPanelProps {
  importText: string;
  onImportTextChange(value: string): void;
  onImportJson(): void;
  onExportJson(): void;
  onImportFile(file: File): void;
  onDownloadJson(): void;
  title?: string;
  placeholder?: string;
  importLabel?: string;
  exportLabel?: string;
  downloadLabel?: string;
  loadFileLabel?: string;
}

export function ImportExportPanel({
  importText,
  onImportTextChange,
  onImportJson,
  onExportJson,
  onImportFile,
  onDownloadJson,
  title = "Import / Export",
  placeholder = "Paste a runtime JSON document with model, options, and optional scenario",
  importLabel = "Import JSON",
  exportLabel = "Export to text",
  downloadLabel = "Download JSON",
  loadFileLabel = "Load file"
}: ImportExportPanelProps) {
  return (
    <section className="editor-panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <div className="button-row">
          <label className="file-button">
            <input
              type="file"
            accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImportFile(file);
                }
                event.currentTarget.value = "";
              }}
            />
            {loadFileLabel}
          </label>
          <button type="button" onClick={onImportJson}>
            {importLabel}
          </button>
          <button type="button" onClick={onExportJson}>
            {exportLabel}
          </button>
          <button type="button" onClick={onDownloadJson}>
            {downloadLabel}
          </button>
        </div>
      </div>

      <textarea
        className="json-area"
        value={importText}
        onChange={(event) => onImportTextChange(event.target.value)}
        placeholder={placeholder}
      />
    </section>
  );
}
