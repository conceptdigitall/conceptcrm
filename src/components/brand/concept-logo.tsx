import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ConceptLogoProps {
  variant?: "full" | "icon" | "badge";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showTagline?: boolean;
}

export function ConceptLogo({
  variant = "full",
  size = "md",
  className,
  showTagline = false,
}: ConceptLogoProps) {
  const badgeSizes = {
    sm: "w-8 h-8 rounded-lg",
    md: "w-9 h-9 rounded-xl",
    lg: "w-12 h-12 rounded-xl",
    xl: "w-16 h-16 rounded-2xl",
  };

  const imageSizes = {
    sm: 24,
    md: 32,
    lg: 44,
    xl: 60,
  };

  if (variant === "badge" || variant === "icon") {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full overflow-hidden border border-[#C5A880]/60 bg-black shadow-md shadow-[#C5A880]/20",
          badgeSizes[size],
          className
        )}
      >
        <Image
          src="/barbearia-logo.png"
          alt="Barbearia do Alemão 777"
          width={imageSizes[size]}
          height={imageSizes[size]}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full overflow-hidden border-2 border-[#C5A880] bg-black shadow-md shadow-[#C5A880]/25 shrink-0",
          badgeSizes[size]
        )}
      >
        <Image
          src="/barbearia-logo.png"
          alt="Barbearia do Alemão 777"
          width={imageSizes[size]}
          height={imageSizes[size]}
          className="object-cover"
        />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-heading font-black tracking-wider text-foreground text-sm uppercase leading-none">
            ALEMÃO
          </span>
          <span className="font-heading font-bold text-xs uppercase px-1.5 py-0.5 rounded bg-[#C5A880]/20 text-[#C5A880] border border-[#C5A880]/30 leading-none">
            777 CRM
          </span>
        </div>
        <span className="text-[9px] tracking-widest uppercase text-[#C5A880] font-semibold mt-0.5">
          Barbearia • Desde 2020
        </span>
      </div>
    </div>
  );
}
