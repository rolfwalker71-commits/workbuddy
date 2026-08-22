"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BRAND } from "@/lib/branding";
import { BuddyLogo } from "@/components/brand/buddy-logo";
import { Sidebar } from "./sidebar";

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl"
          aria-label="Menü öffnen"
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{BRAND.app}</SheetTitle>
            <SheetDescription>Navigation</SheetDescription>
          </SheetHeader>
          <Sidebar onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <BuddyLogo size={32} className="size-8" />
      <p className="text-base font-semibold tracking-tight">{BRAND.app}</p>
    </header>
  );
}
