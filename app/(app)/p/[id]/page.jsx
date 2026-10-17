import { notFound } from "next/navigation";
import { typeLabel } from "@/lib/pins";
import { getSharedPin } from "@/lib/server-pins";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { pin } = await getSharedPin(decodeURIComponent(id));
  if (!pin) return { title: "Pin" };
  const area = pin.approximate ? "Approximate area" : pin.placeLabel;
  const summary = [typeLabel(pin.type), pin.category, area].filter(Boolean).join(" · ");
  const description = [summary, pin.description].filter(Boolean).join(" — ").slice(0, 200);
  return {
    title: pin.title,
    description,
    openGraph: { title: pin.title, description, type: "article", url: `/p/${pin.id}` },
    twitter: { title: pin.title, description },
  };
}

// The map app (in the layout) shows the pin. This page only sets the share
// preview, and answers 404 when the pin definitely doesn't exist.
export default async function PinPage({ params }) {
  const { id } = await params;
  const { missing } = await getSharedPin(decodeURIComponent(id));
  if (missing) notFound();
  return null;
}
