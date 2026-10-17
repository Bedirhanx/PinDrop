import {
  Accessibility,
  Drill,
  Globe,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Leaf,
  MapPin,
  Palette,
  PawPrint,
  ShieldAlert,
  ShoppingBag,
  Briefcase,
  Utensils,
  Wrench,
} from "lucide-react";
import { categoryGroupFor } from "@/lib/pins";

const ICONS = {
  everyday: ShoppingBag,
  home: Wrench,
  learning: GraduationCap,
  work: Briefcase,
  care: HeartHandshake,
  food: Utensils,
  resources: Drill,
  wellness: HeartPulse,
  safety: ShieldAlert,
  accessibility: Accessibility,
  newcomers: Globe,
  environment: Leaf,
  culture: Palette,
  animals: PawPrint,
};

export default function CategoryIcon({ category, group, ...props }) {
  const id = group || categoryGroupFor(category || "")?.id;
  const Icon = ICONS[id] || MapPin;
  return <Icon aria-hidden="true" {...props} />;
}

// Lucide has no rideshare icon, so this one is drawn by hand.
export function RideshareIcon({ size = 24, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="9" cy="5" r="2" />
      <path d="M9 9v6m0 0-3 6m3-6 4 6M9 10l-5 4m5-4 5-3 2-5m0 0 2 1m-2-1V1" />
    </svg>
  );
}
