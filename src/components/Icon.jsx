import { Activity, AlertTriangle, ArrowDown, ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpRight, AudioLines, BarChart3, Boxes, Check, Coins, Copy, Database, Download, Eye, EyeOff, FileText, GitFork, Globe, HardDrive, Info, KeyRound, LayoutGrid, Link, LogOut, Menu, Monitor, Moon, Pencil, Play, Plus, Radio, RefreshCw, Search, Server, Settings, ShieldCheck, Sliders, Sun, Tag, Terminal, Trash2, X } from 'lucide-react';

const icons = { grid: LayoutGrid, boxes: Boxes, server: Server, 'hard-drive': HardDrive, sliders: Sliders, chart: BarChart3, link: Link, fork: GitFork, search: Search, refresh: RefreshCw, arrow: ArrowRight, back: ArrowLeft, close: X, menu: Menu, logout: LogOut, check: Check, shield: ShieldCheck, settings: Settings, globe: Globe, activity: Activity, terminal: Terminal, input: ArrowDownLeft, output: ArrowUpRight, coins: Coins, tag: Tag, radio: Radio, copy: Copy, eye: Eye, hide: EyeOff, info: Info, plus: Plus, edit: Pencil, trash: Trash2, play: Play, download: Download, key: KeyRound, logs: FileText, tokens: ArrowLeftRight, cache: Database, sun: Sun, moon: Moon, monitor: Monitor, warning: AlertTriangle };

export default function Icon({ name, className = '' }) {
  const Component = ({ audio: AudioLines, up: ArrowUp, down: ArrowDown })[name] || icons[name] || LayoutGrid;
  return <Component className={`icon ${className}`} strokeWidth={1.65} aria-hidden="true"/>;
}
