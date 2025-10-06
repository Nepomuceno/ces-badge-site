import { describe, expect, it } from 'vitest'

import { mergeRoster, type AllowedUser } from '../import-graph-users'

describe('mergeRoster', () => {
  it('retains users already in the roster while adding new ones', () => {
    const current: AllowedUser[] = [
      {
        alias: 'existing',
        email: 'existing@microsoft.com',
        name: 'Existing User',
        role: 'member',
        logos: ['logo-1'],
        passwordHash: 'hashed',
      },
    ]

    const incoming = new Map<string, AllowedUser>([
      [
        'newuser',
        {
          alias: 'newuser',
          email: 'new.user@microsoft.com',
          name: 'New User',
          role: 'member',
        },
      ],
    ])

    const { added, updated } = mergeRoster(current, incoming, new Set())

    expect(added).toEqual(['newuser'])
    expect(updated).toEqual([])
    expect(current.map((user) => user.alias)).toEqual(['existing', 'newuser'])
    expect(current.find((user) => user.alias === 'existing')).toMatchObject({
      role: 'member',
      logos: ['logo-1'],
      passwordHash: 'hashed',
    })
  })

  it('preserves existing admin privileges and merges available data', () => {
    const current: AllowedUser[] = [
      {
        alias: 'adminuser',
        email: 'admin.user@microsoft.com',
        name: 'Admin User',
        role: 'admin',
        logos: ['logo-9'],
        passwordHash: 'secure',
      },
    ]

    const incoming = new Map<string, AllowedUser>([
      [
        'adminuser',
        {
          alias: 'adminuser',
          email: 'updated.admin@microsoft.com',
          name: 'Admin Updated',
          role: 'member',
        },
      ],
    ])

    const { added, updated } = mergeRoster(current, incoming, new Set())

    expect(added).toEqual([])
    expect(updated).toEqual(['adminuser'])
    expect(current).toHaveLength(1)
    expect(current[0]).toMatchObject({
      alias: 'adminuser',
      email: 'updated.admin@microsoft.com',
      name: 'Admin Updated',
      role: 'admin',
      logos: ['logo-9'],
      passwordHash: 'secure',
    })
  })
})
