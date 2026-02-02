/**
 * Root Route
 * Top-level route that wraps all pages with the BaseLayout shell.
 */

import React from 'react'
import BaseLayout from '@/components/layout/base-layout'
import { Outlet, createRootRoute } from '@tanstack/react-router'

export const RootRoute = createRootRoute({
  component: Root,
})

function Root() {
  return (
    <BaseLayout>
      <Outlet />
    </BaseLayout>
  )
}
