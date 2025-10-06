import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/gallery/$logoId')({
  loader: ({ params }) => {
    throw redirect({
      to: '/logos/$logoId',
      params: { logoId: params.logoId },
      replace: true,
    })
  },
})
