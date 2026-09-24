import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MemoTemplateSection } from "@/lib/exercises/memo-extraction/template";

// The memo answer as guided boxes, one per section (see memoSectionsFor).
// `values` is indexed like `sections`; the parent owns state and submission.
export function MemoSections({
  sections,
  values,
  onChange,
  disabled
}: {
  sections: readonly MemoTemplateSection[];
  values: readonly string[];
  onChange: (index: number, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      {sections.map((s, i) => (
        <div key={`${i}-${s.title}`} className="space-y-2">
          <Label htmlFor={`memo-${i}`} className="text-sm font-semibold">
            {i + 1}. {s.title}
          </Label>
          {s.guide ? (
            <p
              id={`memo-${i}-guide`}
              className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground"
            >
              {s.guide}
            </p>
          ) : null}
          <Textarea
            id={`memo-${i}`}
            aria-describedby={s.guide ? `memo-${i}-guide` : undefined}
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
