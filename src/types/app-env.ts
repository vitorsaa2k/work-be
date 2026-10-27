import type { AuthenticatedUserDto } from '../modules/auth/auth.service.js'

export interface AppVariables {
  requestId: string
  user?: AuthenticatedUserDto
}

export interface AppEnv {
  Variables: AppVariables
}
