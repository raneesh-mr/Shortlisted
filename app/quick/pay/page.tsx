import { Suspense } from "react";
import { QuickPay } from "@/components/quick/pay";

export default function PayPage() {
  return (
    <Suspense>
      <QuickPay />
    </Suspense>
  );
}
