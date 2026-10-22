import Link from "next/link";
import { brand } from "@/config/brand";

/** "Short" + gold serif "listed", as on Real Plannet's MakeMyCV. Falls back to plain text for other names. */
export function BrandMark({ href = "/", className = "" }: { href?: string; className?: string }) {
  const name = brand.name;
  const split = name.toLowerCase() === "shortlisted" ? [name.slice(0, 5), name.slice(5)] : [name, ""];
  return (
    <Link href={href} className={`inline-flex items-baseline gap-px text-xl font-medium text-ink-strong no-underline ${className}`} aria-label={`${name} home`}>
      <span>{split[0]}</span>
      {split[1] && <span className="font-display text-2xl font-semibold text-accent-strong">{split[1]}</span>}
    </Link>
  );
}
