'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

// Smooth-scrolls to an in-page element by id. Renders as an anchor so the
// browser handles keyboard activation (Tab + Enter), and the URL hash
// reflects the current focus stage for shareable / refresh-stable position.
// Used by the stage progress stepper on the enrollment tab — clicking a
// stepper node jumps to the matching detail tile below.

type Props = {
  targetId: string;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
};

export function StageScrollLink({
  targetId,
  children,
  className,
  ...rest
}: Props) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof history !== 'undefined') {
      history.replaceState(null, '', `#${targetId}`);
    }
  }

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className={cn(
        'rounded-md outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        className
      )}
      {...rest}
    >
      {children}
    </a>
  );
}
