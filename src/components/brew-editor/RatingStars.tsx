// Read-only stars for a saved rating (half stars included), sized by the surrounding font.
export function RatingStars({ value, className = "" }: { value: number; className?: string }) {
  if (!value) return null;
  return <span className={`bw-stars ${className}`} role="img" aria-label={`별점 ${value}점`}>
    {[1, 2, 3, 4, 5].map(star => <span key={star} className={value >= star ? "full" : value >= star - 0.5 ? "half" : ""} aria-hidden="true">★</span>)}
  </span>;
}
