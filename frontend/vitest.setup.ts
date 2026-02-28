import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock aws-amplify/auth
vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    username: 'testuser',
    signInDetails: { loginId: 'test@example.com' }
  }),
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      idToken: {
        toString: () => 'fake-token'
      }
    }
  }),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  confirmSignUp: vi.fn(),
}))

// Mock IndexedDB
const mockRequest = {
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
  result: {
    createObjectStore: vi.fn().mockReturnValue({
      createIndex: vi.fn(),
    }),
    transaction: vi.fn().mockReturnValue({
      objectStore: vi.fn().mockReturnValue({
        add: vi.fn().mockReturnValue({}),
        put: vi.fn().mockReturnValue({}),
        get: vi.fn().mockReturnValue({}),
        getAll: vi.fn().mockReturnValue({}),
        delete: vi.fn().mockReturnValue({}),
        clear: vi.fn().mockReturnValue({}),
      }),
      oncomplete: null,
      onerror: null,
    }),
  },
}

const indexedDB = {
  open: vi.fn().mockReturnValue(mockRequest),
  deleteDatabase: vi.fn().mockReturnValue(mockRequest),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.indexedDB = indexedDB as any
