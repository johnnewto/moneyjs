import type { NotebookSourceFormat } from "./document";
import { getNotebookSourceMimeType } from "./notebookSourceWorkflow";

export const NOTEBOOK_SAVE_DIALOG_STORAGE_KEY = "sfcr:notebook-save-dialog";

type SaveFilePickerType = {
  accept: Record<string, string[]>;
  description: string;
};

type NotebookSaveWindow = Window & {
  showSaveFilePicker?(options: {
    suggestedName?: string;
    types?: SaveFilePickerType[];
  }): Promise<FileSystemFileHandle>;
};

function getNotebookSaveWindow(): NotebookSaveWindow | null {
  return typeof window !== "undefined" ? window : null;
}

export function isNotebookSaveDialogSupported(): boolean {
  return typeof getNotebookSaveWindow()?.showSaveFilePicker === "function";
}

export function readNotebookSaveDialogPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const stored = window.localStorage.getItem(NOTEBOOK_SAVE_DIALOG_STORAGE_KEY);
  if (stored === "0") {
    return false;
  }
  if (stored === "1") {
    return true;
  }

  return isNotebookSaveDialogSupported();
}

export function writeNotebookSaveDialogPreference(enabled: boolean): void {
  window.localStorage.setItem(NOTEBOOK_SAVE_DIALOG_STORAGE_KEY, enabled ? "1" : "0");
}

function getNotebookSaveFilePickerTypes(format: NotebookSourceFormat): SaveFilePickerType[] {
  if (format === "json") {
    return [
      {
        description: "JSON Notebook",
        accept: { "application/json": [".json", ".sfnb.json"] }
      }
    ];
  }

  if (format === "yaml") {
    return [
      {
        description: "YAML Notebook",
        accept: {
          "application/yaml": [".yaml", ".yml", ".notebook.yaml"],
          "text/yaml": [".yaml", ".yml", ".notebook.yaml"]
        }
      }
    ];
  }

  return [
    {
      description: "Markdown Notebook",
      accept: { "text/markdown": [".md", ".markdown", ".sfnb.md"] }
    }
  ];
}

function downloadNotebookSourceFile(content: string, fileName: string, format: NotebookSourceFormat): void {
  const blob = new Blob([content], {
    type: getNotebookSourceMimeType(format)
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function saveNotebookSourceFile(args: {
  content: string;
  fileName: string;
  format: NotebookSourceFormat;
  useSaveDialog: boolean;
}): Promise<{ fileName: string; status: "cancelled" | "saved" }> {
  const saveWindow = getNotebookSaveWindow();
  const showSaveFilePicker = saveWindow?.showSaveFilePicker;

  if (args.useSaveDialog && typeof showSaveFilePicker === "function") {
    try {
      const handle = await showSaveFilePicker.call(saveWindow, {
        suggestedName: args.fileName,
        types: getNotebookSaveFilePickerTypes(args.format)
      });
      const writable = await handle.createWritable();
      await writable.write(args.content);
      await writable.close();
      return { fileName: handle.name, status: "saved" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { fileName: args.fileName, status: "cancelled" };
      }

      throw error;
    }
  }

  downloadNotebookSourceFile(args.content, args.fileName, args.format);
  return { fileName: args.fileName, status: "saved" };
}
