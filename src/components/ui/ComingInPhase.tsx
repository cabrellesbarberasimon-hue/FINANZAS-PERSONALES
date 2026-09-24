import { Construction } from "lucide-react";
import { Card } from "./Card";

export function ComingInPhase({ phase, items }: { phase: number; items: string[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-info">
        <Construction className="size-4" aria-hidden />
        <span className="text-sm font-medium">Se implementa en la fase {phase}</span>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </Card>
  );
}
