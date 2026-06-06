export function EquationSectionCollapseControls({
  onCollapseAll,
  onExpandAll
}: {
  onCollapseAll(): void;
  onExpandAll(): void;
}) {
  return (
    <>
      <button type="button" className="notebook-run-button" onClick={onExpandAll}>
        Expand all
      </button>
      <button type="button" className="notebook-run-button" onClick={onCollapseAll}>
        Collapse all
      </button>
    </>
  );
}
