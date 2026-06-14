export function PublicationCaption({
  description,
  note,
  title
}: {
  description?: string;
  note?: string;
  title: string;
}) {
  const captionParts = [description?.trim(), note?.trim()].filter(Boolean);

  return (
    <figcaption className="publication-caption">
      <strong className="publication-caption-title">{title}</strong>
      {captionParts.length > 0 ? (
        <span className="publication-caption-detail">{captionParts.join(" ")}</span>
      ) : null}
    </figcaption>
  );
}
