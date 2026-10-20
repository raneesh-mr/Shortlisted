"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./app-provider";

/** Sends people who already have a session straight into the app. */
export function OpenAppRedirect() {
  const { status } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (status === "ready") router.replace("/home");
  }, [status, router]);
  return null;
}
