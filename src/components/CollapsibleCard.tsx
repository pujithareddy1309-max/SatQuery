import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CollapsibleCardProps {
  id?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  badge?: React.ReactNode;
  headerRightExtra?: React.ReactNode;
  collapsedSummary?: React.ReactNode;
  defaultCollapsed?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  variant?: 'default' | 'emerald' | 'indigo' | 'cyan' | 'amber';
  children: React.ReactNode;
}

export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  id,
  title,
  subtitle,
  icon: Icon,
  iconColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  badge,
  headerRightExtra,
  collapsedSummary,
  defaultCollapsed = false,
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse,
  className = '',
  headerClassName = '',
  bodyClassName = 'p-5',
  variant = 'default',
  children,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isControlled = controlledIsCollapsed !== undefined;
  const collapsed = isControlled ? controlledIsCollapsed : internalCollapsed;

  const handleToggle = () => {
    const nextState = !collapsed;
    if (!isControlled) {
      setInternalCollapsed(nextState);
    }
    if (onToggleCollapse) {
      onToggleCollapse(nextState);
    }
  };

  // Variant border & glow themes
  const variantStyles = {
    default: 'bg-slate-900/80 border-slate-800 shadow-sm',
    emerald: 'bg-slate-900/90 border-emerald-500/30 shadow-md shadow-emerald-950/20',
    indigo: 'bg-slate-900/95 border-indigo-500/35 shadow-lg shadow-indigo-950/25',
    cyan: 'bg-slate-900/90 border-cyan-500/30 shadow-md shadow-cyan-950/20',
    amber: 'bg-slate-900/90 border-amber-500/30 shadow-md shadow-amber-950/20',
  }[variant];

  return (
    <div
      id={id}
      className={`rounded-xl border transition-all duration-200 ${variantStyles} ${className}`}
    >
      {/* Card Header with Top-Right Chevron Collapse Toggle */}
      <div
        className={`flex items-center justify-between px-5 py-4 select-none ${
          !collapsed ? 'border-b border-slate-800/80' : ''
        } ${headerClassName}`}
      >
        {/* Left: Icon, Title & Subtitle */}
        <div
          className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0 pr-3"
          onClick={handleToggle}
          title={collapsed ? 'Click to expand panel' : 'Click to collapse panel'}
        >
          {Icon && (
            <div
              className={`p-2 rounded-lg border flex-shrink-0 transition-transform group-hover:scale-105 ${iconColor}`}
            >
              <Icon className="w-4 h-4" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-white group-hover:text-emerald-300 transition-colors truncate">
                {title}
              </h2>
              {badge}
            </div>

            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
            )}

            {collapsed && collapsedSummary && (
              <div className="mt-1 text-xs text-slate-400 flex items-center gap-1.5">
                {collapsedSummary}
              </div>
            )}
          </div>
        </div>

        {/* Right: Extra controls & Sleek Chevron Arrow Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {headerRightExtra}

          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={!collapsed}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
              collapsed
                ? 'bg-slate-800/90 hover:bg-slate-700 border-slate-700 text-emerald-400 shadow-sm hover:scale-105'
                : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200'
            }`}
            title={
              collapsed
                ? 'Expand panel (keyboard_arrow_down)'
                : 'Collapse panel (keyboard_arrow_up)'
            }
          >
            {collapsed ? (
              <ChevronDown className="w-4 h-4 transition-transform duration-200" />
            ) : (
              <ChevronUp className="w-4 h-4 transition-transform duration-200" />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Card Body */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                height: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.2, ease: 'easeOut' },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.15, ease: 'easeIn' },
              },
            }}
            className="overflow-hidden"
          >
            <div className={bodyClassName}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
