import type { NotebookCell } from "@sfcr/notebook-core";

export * from "@sfcr/notebook-core";

export type NotebookCellInsertType = Extract<
	NotebookCell["type"],
	"chart" | "markdown" | "matrix" | "run" | "sequence" | "table"
>;
