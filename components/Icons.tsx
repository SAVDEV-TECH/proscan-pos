import React from 'react';
import { isRealImage } from '@/lib/products';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

const baseProps: React.SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function CartIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

export function PackageIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

export function ScanIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" x2="17" y1="12" y2="12" />
    </svg>
  );
}

export function CameraIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

export function VolumeOnIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export function VolumeOffIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" x2="16" y1="9" y2="15" />
      <line x1="16" x2="22" y1="9" y2="15" />
    </svg>
  );
}

export function FlashlightIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function RefreshIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function PlayIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

export function PauseIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function TargetIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function CheckIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function AlertIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

export function SearchIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function PlusIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function XIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function EditIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function TrashIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

export function TagIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

export function ReceiptIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </svg>
  );
}

export function CreditCardIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

export function BanknoteIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

export function BuildingBankIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <line x1="3" x2="21" y1="22" y2="22" />
      <line x1="6" x2="6" y1="18" y2="11" />
      <line x1="10" x2="10" y1="18" y2="11" />
      <line x1="14" x2="14" y1="18" y2="11" />
      <line x1="18" x2="18" y1="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}

export function PrinterIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </svg>
  );
}

export function ChevronUpIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

export function CpuIcon({ className = 'w-4 h-4', ...props }: IconProps) {
  return (
    <svg {...baseProps} className={className} {...props}>
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" />
    </svg>
  );
}

export function ProductThumbnail({
  src,
  name,
  category,
  className = 'w-12 h-12 rounded-xl',
}: {
  src?: string | null;
  name?: string;
  category?: string;
  className?: string;
}) {
  if (src && isRealImage(src)) {
    return (
      <img
        src={src}
        alt={name || 'Product'}
        className={`${className} object-cover border border-slate-200 shrink-0`}
      />
    );
  }

  const cat = (category || name || '').toLowerCase();
  let bgClass = 'bg-slate-100 text-slate-600';
  if (cat.includes('produce') || cat.includes('apple') || cat.includes('banana') || cat.includes('orange')) {
    bgClass = 'bg-emerald-50 text-emerald-600 border border-emerald-200';
  } else if (cat.includes('beverage') || cat.includes('water') || cat.includes('drink')) {
    bgClass = 'bg-sky-50 text-sky-600 border border-sky-200';
  } else if (cat.includes('deli') || cat.includes('food') || cat.includes('bakery') || cat.includes('noodle')) {
    bgClass = 'bg-amber-50 text-amber-600 border border-amber-200';
  } else if (cat.includes('electronic') || cat.includes('phone')) {
    bgClass = 'bg-indigo-50 text-indigo-600 border border-indigo-200';
  }

  return (
    <div className={`${className} ${bgClass} flex items-center justify-center shrink-0`}>
      <PackageIcon className="w-1/2 h-1/2" />
    </div>
  );
}
