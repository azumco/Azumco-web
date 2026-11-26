// Icons for the service pages (lucide, the same set the rest of the site uses).
import {
  AppWindow, Instagram, LayoutDashboard, MapPin, Megaphone, ShieldCheck, Smartphone, Sparkles, Video, Workflow, type LucideIcon,
} from 'lucide-react';
import type { ServiceIcon } from '../../serviceTypes';

export const SERVICE_ICON: Record<ServiceIcon, LucideIcon> = {
  web: AppWindow,
  phone: Smartphone,
  software: LayoutDashboard,
  automation: Workflow,
  pin: MapPin,
  social: Instagram,
  ads: Megaphone,
  brand: Sparkles,
  video: Video,
  care: ShieldCheck,
};

/** The rounded icon tile used on cards and in the hero eyebrow. */
export function IconTile({ icon, size = 'md' }: { icon: ServiceIcon; size?: 'sm' | 'md' }) {
  const Icon = SERVICE_ICON[icon];
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand ${size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'}`}
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </span>
  );
}
