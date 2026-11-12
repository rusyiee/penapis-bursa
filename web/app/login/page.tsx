import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Log masuk · Penapis Bursa" };

export default function LoginPage() {
  return <LoginForm />;
}
