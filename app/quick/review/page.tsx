import { Suspense } from "react";
import { QuickReview } from "@/components/quick/review";

export default function ReviewPage() {
  return (
    <Suspense>
      <QuickReview />
    </Suspense>
  );
}
