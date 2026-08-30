import { DrawingApp } from "@/features/canvas/DrawingApp";

export default function Page() {
  return (
    <main className="w-full h-full flex flex-col relative overflow-hidden">
      <DrawingApp />
    </main>
  );
}
