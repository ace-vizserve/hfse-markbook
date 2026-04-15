import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Opening report card",
};

export default function ParentEnterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
