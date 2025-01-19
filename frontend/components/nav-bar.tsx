'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Settings, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export function NavBar() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <div className="sticky top-0 z-50 w-full border-b border-purple-900/20 bg-[#0a0a0a]/80 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-3 max-w-5xl">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Saral Viewer
          </Link>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "text-gray-400 hover:text-blue-300 hover:bg-blue-500/10",
                  isActive('/') && "text-blue-300 bg-blue-500/10"
                )}
              >
                <LayoutGrid className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Grid View</span>
              </Button>
            </Link>
            
            <Link href="/settings">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "text-gray-400 hover:text-blue-300 hover:bg-blue-500/10",
                  isActive('/settings') && "text-blue-300 bg-blue-500/10"
                )}
              >
                <Settings className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}