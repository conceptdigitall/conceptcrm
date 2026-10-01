"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  GitBranch,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Hick's Law: decision time grows with the number of choices. On mobile
// we surface only the four destinations used every day as one-tap tabs;
// everything else lives behind "Mais", which opens the sidebar drawer
// (and the drawer hides these four so it isn't repeating them).
export const MOBILE_PRIMARY_NAV = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
  { href: "/contacts", labelKey: "contacts", icon: Users },
  { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
] as const;

export const MOBILE_PRIMARY_HREFS: ReadonlySet<string> = new Set(
  MOBILE_PRIMARY_NAV.map((item) => item.href),
);

export function isNavItemActive(pathname: string, href: string): boolean {
  return (
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
  );
}

interface MobileBottomNavProps {
  onOpenMore: () => void;
  /** Passed down from the shell — see `useTotalUnread` there. */
  totalUnread: number;
}

export function MobileBottomNav({ onOpenMore, totalUnread }: MobileBottomNavProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();

  // "Mais" reads as active when the current page is one of the drawer's
  // destinations, so the user always sees where they are.
  const moreActive = !MOBILE_PRIMARY_NAV.some((item) =>
    isNavItemActive(pathname, item.href),
  );

  const tabClass = (active: boolean) =>
    cn(
      "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground active:text-foreground",
    );

  return (
    <nav
      aria-label={t("primaryNav")}
      className="shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex">
        {MOBILE_PRIMARY_NAV.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const showUnread = item.href === "/inbox" && totalUnread > 0;
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                <span className="relative">
                  <item.icon className="h-5 w-5" />
                  {showUnread && (
                    <span
                      aria-label={t("unreadConversations", { count: totalUnread })}
                      className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground"
                    >
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                  )}
                </span>
                {t(item.labelKey)}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button type="button" onClick={onOpenMore} className={tabClass(moreActive)}>
            <Menu className="h-5 w-5" />
            {t("more")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
