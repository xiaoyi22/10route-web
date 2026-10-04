import { Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Check, Coins, Copy, Download, Eye, EyeOff, FileText, Globe, KeyRound, LayoutGrid, Link, LogOut, Menu, Pencil, Play, Plus, Radio, RefreshCw, Search, Server, ShieldCheck, Trash2, X } from 'lucide-react';

const icons = { grid: LayoutGrid, server: Server, chart: BarChart3, link: Link, search: Search, refresh: RefreshCw, arrow: ArrowRight, back: ArrowLeft, close: X, menu: Menu, logout: LogOut, check: Check, shield: ShieldCheck, globe: Globe, activity: Activity, input: ArrowDownLeft, output: ArrowUpRight, coins: Coins, radio: Radio, copy: Copy, eye: Eye, hide: EyeOff, plus: Plus, edit: Pencil, trash: Trash2, play: Play, download: Download, key: KeyRound, logs: FileText };

export default function Icon({ name, className = '' }) {
  const Component = icons[name] || LayoutGrid;
  return <Component className={`icon ${className}`} strokeWidth={1.65} aria-hidden="true"/>;
}
