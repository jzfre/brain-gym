import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MEMO_TEMPLATE } from "@/lib/exercises/memo-extraction/template";

// The memo answer as six guided boxes (see MEMO_TEMPLATE). `values` is indexed
// like the template; the parent owns state and submission.
export function MemoSections({
  values,
  onChange,
  disabled
}: {
  values: readonly string[];
  onChange: (index: number, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      {MEMO_TEMPLATE.map((s, i) => (
        <div key={s.title} className="space-y-2">
          <Label htmlFor={`memo-${i}`} className="text-sm font-semibold">
            {i + 1}. {s.title}
          </Label>
          <p
            id={`memo-${i}-guide`}
            className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground"
          >
            {s.guide}
          </p>
          <Textarea
            id={`memo-${i}`}
            aria-describedby={`memo-${i}-guide`}
            value={values[i] ?? ""}
            onChange={(e) => onChange(i, e.target.value)}
            disabled={disabled}
            className="min-h-[120px]"
          />
        </div>
      ))}
    </div>
  );
}
