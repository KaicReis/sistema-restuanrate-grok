import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DNA • Gestão e precificação de restaurantes",
  description:
    "Entenda seus custos e precifique com margem. DNA financeiro mensal para restaurantes.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
