import { NavLink, Outlet } from "react-router-dom";
import {
  ChartPie,
  CreditCard,
  Landmark,
  LayoutGrid,
  LogOut,
  PlusCircle,
  Settings,
  Tags,
  LayoutList,
  ListOrdered,
  Users,
  Repeat2,
  TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/auth";

export type AppContext = {
  user: AuthUser;
};

type Props = {
  user: AuthUser;
  onLogout: () => void;
};

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex cursor-pointer items-center gap-3 rounded-[11px] px-3.5 py-3 text-sm font-medium transition-colors",
    isActive &&
      "bg-sidebar-accent font-bold text-sidebar-accent-foreground before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-0.5 before:rounded-sm before:bg-primary before:content-['']",
    !isActive && "text-muted-foreground hover:bg-white/5 hover:text-foreground"
  );

export function AppShell({ user, onLogout }: Props) {
  const initial = user.nickname.slice(0, 1);
  const email = user.email ?? `${user.nickname.toLowerCase()}@mybank.io`;

  return (
    <div className="grid h-screen w-full overflow-hidden bg-background lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="flex h-full min-h-0 flex-col gap-1 overflow-hidden border-r border-border bg-sidebar px-[18px] py-[26px] text-sidebar-foreground">
        <div className="mb-3 flex items-center gap-3 px-1.5 pb-2">
          <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/35">
            <LayoutGrid size={21} className="text-white" />
          </div>
          <div className="leading-tight">
            <strong className="block text-lg font-extrabold">MyBank</strong>
            <span className="text-sm text-muted-foreground">{user.nickname}님</span>
          </div>
        </div>

        <div className="mx-1.5 my-5 h-px bg-border" />

        <p className="px-3.5 pb-2.5 text-[11px] font-bold tracking-widest text-muted-foreground/80">메뉴</p>
        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={navLinkClass}>
            <ChartPie size={20} />
            대시보드
          </NavLink>
          <NavLink to="/entry" className={navLinkClass}>
            <PlusCircle size={20} />
            소비기록 입력
          </NavLink>
          <NavLink to="/transaction-types" className={navLinkClass}>
            <ListOrdered size={20} />
            소비유형 관리
          </NavLink>
          <NavLink to="/by-type" className={navLinkClass}>
            <LayoutList size={20} />
            유형별 지출 조회
          </NavLink>
          <NavLink to="/by-category" className={navLinkClass}>
            <Tags size={20} />
            카테고리별 조회
          </NavLink>
          <NavLink to="/cards" className={navLinkClass}>
            <CreditCard size={20} />
            카드 관리
          </NavLink>
          <NavLink to="/shared-card" className={navLinkClass}>
            <Users size={20} />
            공용 카드
          </NavLink>
          <NavLink to="/accounts" className={navLinkClass}>
            <Landmark size={20} />
            계좌 관리
          </NavLink>
          <NavLink to="/categories" className={navLinkClass}>
            <Tags size={20} />
            카테고리 관리
          </NavLink>
          <NavLink to="/other-assets" className={navLinkClass}>
            <Landmark size={20} />
            기타 자산 관리
          </NavLink>
          <NavLink to="/investments" className={navLinkClass}>
            <TrendingUp size={20} />
            주식 자산 관리
          </NavLink>
          <NavLink to="/subscriptions" className={navLinkClass}>
            <Repeat2 size={20} />
            구독 관리
          </NavLink>
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-3 rounded-[11px] px-3.5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Settings size={20} />
            설정
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex cursor-pointer items-center gap-3 rounded-[11px] px-3.5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <LogOut size={20} />
            로그아웃
          </button>
          <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-border bg-secondary p-3">
            <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-300 to-red-400 text-sm font-bold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <strong className="block truncate text-sm font-semibold">{user.nickname}</strong>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-5 py-5 sm:px-8 lg:px-8 lg:py-6 xl:px-10">
        <Outlet context={{ user } satisfies AppContext} />
      </main>
    </div>
  );
}
