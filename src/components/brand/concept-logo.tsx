import React from "react";
import { cn } from "@/lib/utils";

interface ConceptLogoProps {
  variant?: "full" | "icon" | "badge";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  showTagline?: boolean;
}

/**
 * Lobo-Guará Geométrico & Minimalista — Concept Digital
 * Traços finos, silhueta precisa e detalhe sotaque em amarelo ouro (#FCE026).
 */
export function LoboGuaraIcon({
  className,
  accentColor = "#FCE026",
}: {
  className?: string;
  accentColor?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-6 h-6 shrink-0", className)}
      aria-label="Lobo-Guará Concept Digital"
    >
      {/* Silhueta Geométrica / Traços Finos do Lobo-Guará */}
      {/* Base / Pescoço e queixo */}
      <path
        d="M24 44L14 34L17 25L24 31L31 25L34 34L24 44Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-90"
      />
      {/* Focinho e fronte */}
      <path
        d="M24 31V16M24 31L20 23L24 16L28 23L24 31Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Orelha esquerda estilizada longa (característica marcante do Lobo-Guará) */}
      <path
        d="M14 18L11 4L22 13L17 25L14 18Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Orelha direita estilizada longa */}
      <path
        d="M34 18L37 4L26 13L31 25L34 18Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Topo da cabeça */}
      <path
        d="M22 13H26"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Olho esquerdo cirúrgico */}
      <circle cx="19" cy="21" r="1.3" fill="currentColor" opacity="0.8" />
      {/* Olho direito em sotaque Amarelo Ouro (#FCE026) - Precisão e Foco */}
      <circle cx="29" cy="21" r="1.5" fill={accentColor} />
      {/* Ponto focal no focinho */}
      <path
        d="M23 30.5H25"
        stroke={accentColor}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ConceptLogo({
  variant = "full",
  size = "md",
  className,
  showTagline = false,
}: ConceptLogoProps) {
  const iconSizes = {
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-11 h-11",
  };

  const badgeSizes = {
    sm: "w-8 h-8 rounded-lg",
    md: "w-9 h-9 rounded-xl",
    lg: "w-12 h-12 rounded-xl",
    xl: "w-16 h-16 rounded-2xl",
  };

  if (variant === "badge") {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center bg-[#0624C7] text-white shadow-lg shadow-[#0624C7]/25 border border-white/10 transition-all duration-200",
          badgeSizes[size],
          className
        )}
      >
        <LoboGuaraIcon className={iconSizes[size]} />
      </div>
    );
  }

  if (variant === "icon") {
    return (
      <div className={cn("inline-flex items-center justify-center text-primary", className)}>
        <LoboGuaraIcon className={iconSizes[size]} />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex items-center justify-center bg-[#0624C7] text-white shadow-md shadow-[#0624C7]/20 border border-white/10 shrink-0",
          badgeSizes[size]
        )}
      >
        <LoboGuaraIcon className={iconSizes[size]} />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-heading font-black tracking-wider text-foreground text-sm uppercase leading-none">
            CONCEPT
          </span>
          <span className="font-heading font-bold text-xs uppercase px-1.5 py-0.5 rounded bg-[#0624C7]/15 text-[#0624C7] dark:text-[#5373ff] border border-[#0624C7]/20 leading-none">
            CRM
          </span>
        </div>
        {showTagline ? (
          <span className="text-[10px] tracking-widest uppercase text-muted-foreground font-medium mt-1">
            Engenharia de Vendas
          </span>
        ) : (
          <span className="text-[10px] tracking-widest uppercase text-muted-foreground/80 font-medium mt-0.5">
            Digital Assets
          </span>
        )}
      </div>
    </div>
  );
}
