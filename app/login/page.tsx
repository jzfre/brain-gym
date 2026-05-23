import { Suspense } from "react";
import { LoginForm } from "@/components/login/login-form";

export default function LoginPage() {
  return (
    <main className="container mx-auto flex max-w-sm items-center justify-center py-16">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
