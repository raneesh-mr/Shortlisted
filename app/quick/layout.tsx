import { QuickHeader } from "@/components/quick/header";

export default function QuickLayout({ children }: LayoutProps<"/quick">) {
  return (
    <>
      <QuickHeader />
      <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-10 pt-4">
        {children}
      </main>
    </>
  );
}
