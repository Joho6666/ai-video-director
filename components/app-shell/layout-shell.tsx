'use client';

import React from 'react';
import { Sidebar } from './sidebar';

interface LayoutShellProps {
  children: React.ReactNode;
  projectCount?: number;
}

export function LayoutShell({ children, projectCount }: LayoutShellProps) {
  return (
    <div className="app-shell-root">
      <Sidebar currentProjectCount={projectCount} />
      <div className="app-shell-main">
        {children}
      </div>
    </div>
  );
}
