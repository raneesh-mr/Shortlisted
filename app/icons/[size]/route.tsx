import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";

const SIZES = ["192", "512"] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : 192;
  const letter = brand.name.charAt(0).toUpperCase();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.colors.primary,
          color: "#ffffff",
          fontSize: size * 0.55,
          fontWeight: 700,
        }}
      >
        {letter}
      </div>
    ),
    { width: size, height: size },
  );
}
