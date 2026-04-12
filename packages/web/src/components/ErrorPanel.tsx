interface ErrorPanelProps {
  message: string | null;
}

export function ErrorPanel({ message }: ErrorPanelProps) {
  if (!message) {
    return null;
  }

  return (
    <section className="status-panel">
      <div className="error-text">Error: {message}</div>
    </section>
  );
}
