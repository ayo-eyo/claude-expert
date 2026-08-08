'use client';

import { Button } from '@heroui/react';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background font-sans text-foreground">
      <h1 className="text-3xl font-semibold">Video Meeting</h1>
      <p className="max-w-md text-center text-foreground/70">
        Next.js frontend wired up with HeroUI. Edit{' '}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          src/app/page.tsx
        </code>{' '}
        to get started.
      </p>
      <Button variant="primary">HeroUI Button</Button>
    </div>
  );
}
