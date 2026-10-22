import { Suspense } from "react";
import { QuickDone } from "@/components/quick/done";

export default function DonePage() {
  return (
    <Suspense>
      <QuickDone />
    </Suspense>
  );
}
