import { parseEmailBodySegments } from "@/lib/placetrack/email-format";

type EmailBodyPreviewProps = {
  text: string;
  className?: string;
};

export function EmailBodyPreview({ text, className }: EmailBodyPreviewProps) {
  const segments = parseEmailBodySegments(text);

  return (
    <div className={className}>
      {segments.map((segment, index) =>
        segment.type === "link" ? (
          <a
            key={index}
            href={segment.href}
            {...(segment.href.startsWith("tel:") || segment.href.startsWith("mailto:")
              ? {}
              : { target: "_blank", rel: "noopener noreferrer" })}
            className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {segment.label}
          </a>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </div>
  );
}
