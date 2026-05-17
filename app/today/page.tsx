import { ExercisePicker } from "@/components/today/exercise-picker";

export default function TodayPage() {
  return (
    <main className="container mx-auto max-w-3xl py-8">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Today</h1>
      <ExercisePicker />
    </main>
  );
}
