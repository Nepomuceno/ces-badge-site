import { createRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { routeTree } from './routeTree.gen'
import { AppProviders } from './state/AppProviders'

export const getRouter = () =>
  createRouter({
    routeTree,
    defaultPreload: 'intent',
    Wrap: ({ children }: { children: ReactNode }) => (
      <AppProviders>{children}</AppProviders>
    ),
  })
